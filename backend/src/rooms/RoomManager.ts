// Server-authoritative room and race manager. Active state lives in memory;
// the only thing persisted is the final race summary.

import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  buildPassage,
  NET,
  RaceSim,
  ROOM,
  scheduleStart,
  type ClientToServerEvents,
  type LobbyPlayer,
  type RaceSetup,
  type RaceSummary,
  type RoomSettings,
  type RoomStatus,
  type RoomView,
  type SelfState,
  type ServerToClientEvents,
  type SessionInfo,
  type Theme
} from '@shared/index';
import type { HistoryStore } from '../persistence/store';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

interface Player {
  id: string;
  token: string;
  name: string;
  carId: string;
  ready: boolean;
  socketId: string | null;
  profileId: string | null;
  joinedAt: number;
  graceTimer: NodeJS.Timeout | null;
  lastSeq: number;
  bucket: { tokens: number; at: number };
}

interface ActiveRace {
  sim: RaceSim;
  setup: RaceSetup;
  timer: NodeJS.Timeout;
}

interface Room {
  code: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: Map<string, Player>;
  race: ActiveRace | null;
  lastResults?: RaceSummary;
  recentThemes: Theme[];
  closeTimer: NodeJS.Timeout | null;
}

export interface RoomManagerOptions {
  /** Override the light schedule (tests use a short one). */
  schedule?: (now: number) => { lightsAt: number[]; startAt: number };
  /** Override the race length in ms (tests). */
  durationMs?: (durationMin: number) => number;
  lobbyGraceMs?: number;
  raceGraceMs?: number;
}

export class RoomError extends Error {}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private tokens = new Map<string, { code: string; playerId: string }>();
  private socketIndex = new Map<string, { code: string; playerId: string }>();

  constructor(
    private io: IO,
    private store: HistoryStore,
    private opts: RoomManagerOptions = {}
  ) {}

  // ------------------------------------------------------------- helpers

  private generateCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM.CODE_LENGTH; i++) code += ROOM.CODE_ALPHABET[randomInt(ROOM.CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('Could not allocate a room code, please retry');
  }

  private uniqueName(room: Room, name: string): string {
    const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 100; i++) {
      const candidate = `${name.slice(0, ROOM.NAME_MAX - 3)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name.slice(0, 10)} ${randomInt(1000)}`;
  }

  private newPlayer(name: string, carId: string, socket: Sock): Player {
    return {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      name,
      carId,
      ready: false,
      socketId: socket.id,
      profileId: (socket.data as any).profileId ?? null,
      joinedAt: Date.now(),
      graceTimer: null,
      lastSeq: 0,
      bucket: { tokens: NET.INPUT_BURST, at: Date.now() }
    };
  }

  private attach(room: Room, player: Player, socket: Sock) {
    // A player may only be bound to one socket at a time.
    if (player.socketId && player.socketId !== socket.id) {
      const old = this.io.sockets.sockets.get(player.socketId);
      if (old) {
        old.emit('room:closed', 'This seat was opened in another tab or device.');
        old.leave(room.code);
      }
      this.socketIndex.delete(player.socketId);
    }
    player.socketId = socket.id;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = null;
    this.socketIndex.set(socket.id, { code: room.code, playerId: player.id });
    socket.join(room.code);
  }

  private session(room: Room, player: Player): SessionInfo {
    return { code: room.code, playerId: player.id, token: player.token };
  }

  view(room: Room): RoomView {
    const players: LobbyPlayer[] = [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        carId: p.carId,
        ready: p.ready,
        connected: p.socketId !== null,
        isHost: p.id === room.hostId
      }));
    return { code: room.code, status: room.status, hostId: room.hostId, settings: room.settings, players, lastResults: room.lastResults };
  }

  private broadcastRoom(room: Room) {
    this.io.to(room.code).emit('room:updated', this.view(room));
  }

  private lookup(socket: Sock): { room: Room; player: Player } {
    const ref = this.socketIndex.get(socket.id);
    const room = ref && this.rooms.get(ref.code);
    const player = ref && room?.players.get(ref.playerId);
    if (!room || !player) throw new RoomError('You are not in a room');
    return { room, player };
  }

  private requireHost(room: Room, player: Player) {
    if (room.hostId !== player.id) throw new RoomError('Only the host can do that');
  }

  // ---------------------------------------------------------- room lifecycle

  create(socket: Sock, name: string, carId: string, settings: RoomSettings): SessionInfo {
    this.leaveCurrent(socket);
    const code = this.generateCode();
    const room: Room = {
      code,
      hostId: '',
      status: 'WAITING',
      settings,
      players: new Map(),
      race: null,
      recentThemes: [],
      closeTimer: null
    };
    const player = this.newPlayer(name, carId, socket);
    player.ready = true;
    room.hostId = player.id;
    room.players.set(player.id, player);
    this.rooms.set(code, room);
    this.tokens.set(player.token, { code, playerId: player.id });
    this.attach(room, player, socket);
    this.broadcastRoom(room);
    return this.session(room, player);
  }

  join(socket: Sock, code: string, name: string, carId: string): SessionInfo {
    const room = this.rooms.get(code);
    if (!room || room.status === 'CLOSED') throw new RoomError('Room not found. Check the code and try again.');
    if (room.status !== 'WAITING' && room.status !== 'FINISHED') throw new RoomError('That race has already started.');
    if (room.players.size >= room.settings.maxPlayers) throw new RoomError('That room is full.');
    this.leaveCurrent(socket);
    const player = this.newPlayer(this.uniqueName(room, name), carId, socket);
    room.players.set(player.id, player);
    this.tokens.set(player.token, { code, playerId: player.id });
    this.attach(room, player, socket);
    if (room.closeTimer) clearTimeout(room.closeTimer);
    room.closeTimer = null;
    this.broadcastRoom(room);
    return this.session(room, player);
  }

  rejoin(socket: Sock, code: string, token: string): SessionInfo {
    const ref = this.tokens.get(token);
    const room = ref && ref.code === code ? this.rooms.get(code) : undefined;
    const player = ref && room?.players.get(ref.playerId);
    if (!room || !player) throw new RoomError('Your seat in that room has expired.');
    this.attach(room, player, socket);
    this.io.to(room.code).emit('player:reconnected', { playerId: player.id });
    const racer = room.race?.sim.racers.get(player.id);
    if (room.race && racer && !room.race.sim.finished) {
      if (racer.status === 'disconnected') racer.status = 'racing';
      socket.emit('race:countdown', { ...room.race.setup, text: room.race.sim.text });
      this.sendSelf(socket, room, player);
    }
    this.broadcastRoom(room);
    return this.session(room, player);
  }

  /** Explicit leave (button) – the seat is released immediately. */
  leave(socket: Sock) {
    this.leaveCurrent(socket);
  }

  private leaveCurrent(socket: Sock) {
    const ref = this.socketIndex.get(socket.id);
    if (!ref) return;
    const room = this.rooms.get(ref.code);
    socket.leave(ref.code);
    this.socketIndex.delete(socket.id);
    if (room) this.removePlayer(room, ref.playerId);
  }

  private removePlayer(room: Room, playerId: string) {
    const player = room.players.get(playerId);
    if (!player) return;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    const racer = room.race?.sim.racers.get(playerId);
    if (racer && !room.race!.sim.finished) racer.status = 'abandoned';
    room.players.delete(playerId);
    this.tokens.delete(player.token);
    if (player.socketId) this.socketIndex.delete(player.socketId);
    this.io.to(room.code).emit('player:disconnected', { playerId });
    if (room.players.size === 0) {
      // The race (if any) keeps nobody waiting; close the room cleanly.
      this.closeRoom(room, 'Everyone left the room.');
      return;
    }
    if (room.hostId === playerId) this.transferHost(room);
    this.broadcastRoom(room);
  }

  private transferHost(room: Room) {
    const candidates = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const next = candidates.find((p) => p.socketId) ?? candidates[0];
    if (next) {
      room.hostId = next.id;
      next.ready = true;
    }
  }

  private closeRoom(room: Room, reason: string) {
    if (room.race) clearInterval(room.race.timer);
    if (room.closeTimer) clearTimeout(room.closeTimer);
    room.status = 'CLOSED';
    this.io.to(room.code).emit('room:closed', reason);
    for (const p of room.players.values()) {
      if (p.graceTimer) clearTimeout(p.graceTimer);
      this.tokens.delete(p.token);
      if (p.socketId) this.socketIndex.delete(p.socketId);
    }
    this.io.in(room.code).socketsLeave(room.code);
    this.rooms.delete(room.code);
  }

  /** Socket dropped: keep the seat for a grace period. */
  disconnected(socket: Sock) {
    const ref = this.socketIndex.get(socket.id);
    if (!ref) return;
    this.socketIndex.delete(socket.id);
    const room = this.rooms.get(ref.code);
    const player = room?.players.get(ref.playerId);
    if (!room || !player || player.socketId !== socket.id) return;
    player.socketId = null;
    const racing = room.race && !room.race.sim.finished;
    const racer = room.race?.sim.racers.get(player.id);
    if (racing && racer) racer.status = 'disconnected';
    this.io.to(room.code).emit('player:disconnected', { playerId: player.id });
    this.broadcastRoom(room);
    const grace = racing ? (this.opts.raceGraceMs ?? ROOM.RACE_GRACE_MS) : (this.opts.lobbyGraceMs ?? ROOM.LOBBY_GRACE_MS);
    player.graceTimer = setTimeout(() => {
      player.graceTimer = null;
      if (player.socketId) return;
      if (room.race && !room.race.sim.finished) {
        // Mid-race: mark abandoned but keep the result row; seat removed after the race.
        const r = room.race.sim.racers.get(player.id);
        if (r) r.status = 'abandoned';
        player.graceTimer = setTimeout(() => this.removeIfGone(room, player.id), this.opts.lobbyGraceMs ?? ROOM.LOBBY_GRACE_MS);
        return;
      }
      this.removePlayer(room, player.id);
    }, grace);
  }

  private removeIfGone(room: Room, playerId: string) {
    const p = room.players.get(playerId);
    if (p && !p.socketId && this.rooms.get(room.code) === room && !(room.race && !room.race.sim.finished)) {
      this.removePlayer(room, playerId);
    } else if (p && !p.socketId) {
      p.graceTimer = setTimeout(() => this.removeIfGone(room, playerId), 5_000);
    }
  }

  // ------------------------------------------------------------ lobby actions

  setReady(socket: Sock, ready: boolean) {
    const { room, player } = this.lookup(socket);
    if (room.status !== 'WAITING') throw new RoomError('The lobby is locked');
    player.ready = room.hostId === player.id ? true : ready;
    this.broadcastRoom(room);
  }

  selectCar(socket: Sock, carId: string) {
    const { room, player } = this.lookup(socket);
    if (room.status !== 'WAITING' && room.status !== 'FINISHED') throw new RoomError('Cars are locked during the race');
    player.carId = carId;
    this.broadcastRoom(room);
  }

  updateSettings(socket: Sock, patch: Partial<RoomSettings>) {
    const { room, player } = this.lookup(socket);
    this.requireHost(room, player);
    if (room.status !== 'WAITING') throw new RoomError('Settings are locked once the race starts');
    if (patch.maxPlayers !== undefined && patch.maxPlayers < room.players.size) {
      throw new RoomError('More players are already in the room');
    }
    room.settings = { ...room.settings, ...patch };
    this.broadcastRoom(room);
  }

  returnToLobby(socket: Sock) {
    const { room } = this.lookup(socket);
    if (room.status !== 'FINISHED') return;
    room.status = 'WAITING';
    room.race = null;
    for (const p of room.players.values()) p.ready = p.id === room.hostId;
    this.broadcastRoom(room);
  }

  // ------------------------------------------------------------------ racing

  start(socket: Sock) {
    const { room, player } = this.lookup(socket);
    this.requireHost(room, player);
    if (room.status !== 'WAITING') throw new RoomError('The race cannot be started now');
    const present = [...room.players.values()].filter((p) => p.socketId);
    if (present.length < ROOM.MIN_PLAYERS) throw new RoomError(`At least ${ROOM.MIN_PLAYERS} connected players are needed`);
    if (present.some((p) => !p.ready)) throw new RoomError('Everyone must be ready');

    const now = Date.now();
    const seed = randomInt(2 ** 31);
    const stream = buildPassage(seed, room.settings.durationMin, { avoidThemes: room.recentThemes });
    room.recentThemes = stream.themesUsed.slice(0, 3);
    const { lightsAt, startAt } = this.opts.schedule?.(now) ?? scheduleStart(now, randomInt(1_000_000) / 1_000_000);
    const durationMs = this.opts.durationMs?.(room.settings.durationMin) ?? room.settings.durationMin * 60_000;
    const raceId = randomUUID();
    const sim = new RaceSim(raceId, stream, startAt, durationMs);
    for (const p of present) {
      p.lastSeq = 0;
      p.bucket = { tokens: NET.INPUT_BURST, at: now };
      sim.addRacer({ id: p.id, name: p.name, carId: p.carId, isBot: false });
    }
    const setup: RaceSetup = {
      raceId,
      text: stream.text,
      durationMs: sim.durationMs,
      lightsAt,
      startAt,
      endAt: sim.endAt,
      racers: [...sim.racers.values()].map((r) => r.info)
    };
    room.status = 'COUNTDOWN';
    room.race = { sim, setup, timer: setInterval(() => this.loop(room), NET.STATE_BROADCAST_MS) };
    this.io.to(room.code).emit('race:countdown', setup);
    this.broadcastRoom(room);
  }

  private loop(room: Room) {
    const race = room.race;
    if (!race) return;
    const now = Date.now();
    const ev = race.sim.tick(now);
    this.emitTickEvents(room, ev);
    if (room.status === 'COUNTDOWN' && now >= race.sim.startAt) {
      room.status = 'RACING';
      this.broadcastRoom(room);
    }
    this.io.to(room.code).emit('race:state', { raceId: race.sim.raceId, serverNow: now, racers: race.sim.snapshot(now) });
    if (race.sim.finished) this.finish(room);
  }

  private emitTickEvents(room: Room, ev: ReturnType<RaceSim['tick']>) {
    const raceId = room.race!.sim.raceId;
    if (ev.extended) this.io.to(room.code).emit('race:passage-extend', { raceId, ...ev.extended });
    for (const id of ev.crashes) this.io.to(room.code).emit('race:event', { raceId, type: 'crash', playerId: id });
  }

  private finish(room: Room) {
    const race = room.race!;
    clearInterval(race.timer);
    const summary: RaceSummary = {
      raceId: race.sim.raceId,
      mode: 'multiplayer',
      roomCode: room.code,
      durationMin: room.settings.durationMin,
      startedAt: race.sim.startAt,
      results: race.sim.results()
    };
    room.status = 'FINISHED';
    room.lastResults = summary;
    for (const p of room.players.values()) p.ready = p.id === room.hostId;
    this.io.to(room.code).emit('race:finished', summary);
    this.broadcastRoom(room);
    for (const p of room.players.values()) {
      if (!p.profileId || !race.sim.racers.has(p.id)) continue;
      this.store
        .save(p.profileId, { summary, playerId: p.id, source: 'server' })
        .catch((err) => console.warn('[store] could not save race:', err.message));
    }
    room.closeTimer = setTimeout(() => {
      if (this.rooms.get(room.code) === room && room.status === 'FINISHED') this.closeRoom(room, 'Room expired.');
    }, ROOM.FINISHED_ROOM_TTL_MS);
  }

  private sendSelf(socket: Sock, room: Room, player: Player) {
    const racer = room.race?.sim.racers.get(player.id);
    if (!room.race || !racer) return;
    const self: SelfState = {
      typing: racer.typing,
      lastSeq: player.lastSeq,
      falseStart: racer.falseStart,
      lockedUntil: racer.lockedUntil
    };
    socket.emit('race:self', { raceId: room.race.sim.raceId, self });
  }

  requestState(socket: Sock) {
    const { room, player } = this.lookup(socket);
    if (!room.race) return;
    const now = Date.now();
    socket.emit('race:state', { raceId: room.race.sim.raceId, serverNow: now, racers: room.race.sim.snapshot(now) });
    this.sendSelf(socket, room, player);
  }

  input(socket: Sock, seq: number, ops: string) {
    const { room, player } = this.lookup(socket);
    const race = room.race;
    if (!race || race.sim.finished || !race.sim.racers.has(player.id)) return;
    if (seq <= player.lastSeq) return; // duplicate: already scored
    if (seq !== player.lastSeq + 1) {
      // Gap: tell the client where the server is so it can resynchronise.
      this.sendSelf(socket, room, player);
      return;
    }
    player.lastSeq = seq;

    // Token-bucket rate limit (characters per second).
    const now = Date.now();
    const b = player.bucket;
    b.tokens = Math.min(NET.INPUT_BURST, b.tokens + ((now - b.at) / 1000) * NET.INPUT_RATE_CPS);
    b.at = now;
    if (b.tokens < ops.length) {
      this.sendSelf(socket, room, player);
      return;
    }
    b.tokens -= ops.length;

    const outcome = race.sim.input(player.id, ops, now);
    if (!outcome.ok) {
      if (outcome.reason === 'false-start') {
        this.io.to(room.code).emit('race:event', { raceId: race.sim.raceId, type: 'false-start', playerId: player.id });
      }
      this.sendSelf(socket, room, player);
      return;
    }
    if (outcome.applied !== ops.length) this.sendSelf(socket, room, player);
    // Passage extensions triggered by this input are broadcast immediately.
    const ev = race.sim.tick(now);
    this.emitTickEvents(room, ev);
  }

  shutdown() {
    for (const room of [...this.rooms.values()]) this.closeRoom(room, 'Server shutting down.');
  }
}
