// Multiplayer connection state, kept outside React and exposed through a
// tiny subscribe/getSnapshot store (used with useSyncExternalStore).

import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  RaceSummary,
  RoomSettings,
  RoomView,
  ServerToClientEvents,
  SessionInfo
} from '@shared/index';
import { NetRace } from '../race/controller';
import { recordRace } from '../services/history';
import { getProfileId, sessionStore } from '../services/storage';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface MpState {
  connection: 'idle' | 'connecting' | 'online' | 'offline';
  session: SessionInfo | null;
  room: RoomView | null;
  race: NetRace | null;
  results: RaceSummary | null;
  error: string | null;
  notice: string | null;
  rejoining: boolean;
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? undefined;

class MultiplayerClient {
  private socket: ClientSocket | null = null;
  private offset = 0;
  private lastRoom: RoomView | null = null;
  private listeners = new Set<() => void>();
  state: MpState = {
    connection: 'idle',
    session: null,
    room: null,
    race: null,
    results: null,
    error: null,
    notice: null,
    rejoining: false
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;

  private set(patch: Partial<MpState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  clockOffset = () => this.offset;

  /** Estimate server clock offset with a few round trips; keep the lowest-latency sample. */
  private async syncClock() {
    const s = this.socket;
    if (!s) return;
    let best = Infinity;
    for (let i = 0; i < 6; i++) {
      await new Promise<void>((resolve) => {
        const t0 = Date.now();
        const timeout = setTimeout(resolve, 2000);
        s.emit('time:sync', t0, (serverNow: number) => {
          clearTimeout(timeout);
          const t1 = Date.now();
          const rtt = t1 - t0;
          if (rtt < best) {
            best = rtt;
            this.offset = serverNow - (t0 + rtt / 2);
          }
          resolve();
        });
      });
    }
  }

  private ensureSocket(): Promise<ClientSocket> {
    if (this.socket?.connected) return Promise.resolve(this.socket);
    if (!this.socket) {
      this.set({ connection: 'connecting' });
      const socket: ClientSocket = io(SERVER_URL, {
        auth: { profileId: getProfileId() },
        transports: ['websocket', 'polling'],
        reconnectionDelay: 500,
        reconnectionDelayMax: 3000
      });
      this.socket = socket;
      this.bind(socket);
    }
    const socket = this.socket;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Could not reach the race server. Is it running?'));
      }, 8000);
      const ok = () => {
        cleanup();
        resolve(socket);
      };
      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('connect', ok);
      };
      if (socket.connected) ok();
      else socket.on('connect', ok);
    });
  }

  private bind(socket: ClientSocket) {
    socket.on('connect', () => {
      this.set({ connection: 'online' });
      void this.syncClock();
      // Automatic seat recovery after a dropped connection.
      const session = this.state.session;
      if (session) void this.rejoin(session.code, session.token);
    });
    socket.on('disconnect', () => this.set({ connection: 'offline' }));
    socket.io.on('reconnect_attempt', () => this.set({ connection: 'connecting' }));

    socket.on('room:updated', (room) => {
      // The first update can arrive before the create/join ack adopts the session.
      this.lastRoom = room;
      if (this.state.session && room.code === this.state.session.code) this.set({ room });
    });
    socket.on('room:error', (error) => this.set({ error }));
    socket.on('room:closed', (reason) => {
      this.state.race?.dispose();
      sessionStore.set(null);
      this.set({ session: null, room: null, race: null, notice: reason, results: this.state.results });
    });
    socket.on('race:countdown', (setup) => {
      const session = this.state.session;
      if (!session) return;
      const existing = this.state.race;
      if (existing && existing.raceId === setup.raceId) {
        existing.updateText(setup.text);
        return;
      }
      existing?.dispose();
      const race = new NetRace(setup, session.playerId, socket, this.clockOffset);
      this.set({ race, results: null, error: null });
      void this.syncClock();
    });
    socket.on('race:passage-extend', (p) => {
      if (this.state.race?.raceId === p.raceId) this.state.race.extend(p.from, p.text);
    });
    socket.on('race:state', (p) => {
      if (this.state.race?.raceId === p.raceId) this.state.race.applyState(p.serverNow, p.racers);
    });
    socket.on('race:self', (p) => {
      if (this.state.race?.raceId === p.raceId) this.state.race.applySelf(p.self);
    });
    socket.on('race:event', (p) => {
      if (this.state.race?.raceId === p.raceId) this.state.race.serverEvent({ type: p.type, playerId: p.playerId });
    });
    socket.on('race:finished', (summary) => {
      const race = this.state.race;
      if (race && race.raceId === summary.raceId) race.finish(summary);
      if (this.state.session) void recordRace(summary, this.state.session.playerId);
      this.set({ results: summary });
    });
  }

  private adopt(session: SessionInfo) {
    sessionStore.set(session);
    const room = this.lastRoom?.code === session.code ? this.lastRoom : this.state.room;
    this.set({ session, room, error: null, notice: null });
  }

  async create(name: string, carId: string, settings: RoomSettings) {
    const socket = await this.ensureSocket();
    const res = await new Promise<any>((r) => socket.emit('room:create', { name, carId, settings }, r));
    if (!res.ok) throw new Error(res.error);
    this.set({ race: null, results: null, room: null });
    this.adopt(res.data);
  }

  async join(code: string, name: string, carId: string) {
    const socket = await this.ensureSocket();
    const res = await new Promise<any>((r) => socket.emit('room:join', { code, name, carId }, r));
    if (!res.ok) throw new Error(res.error);
    this.set({ race: null, results: null, room: null });
    this.adopt(res.data);
  }

  async rejoin(code: string, token: string): Promise<boolean> {
    this.set({ rejoining: true });
    try {
      const socket = await this.ensureSocket();
      const res = await new Promise<any>((r) => socket.emit('room:rejoin', { code, token }, r));
      if (!res.ok) {
        sessionStore.set(null);
        this.state.race?.dispose();
        this.set({ session: null, room: null, race: null, notice: res.error });
        return false;
      }
      this.adopt(res.data);
      return true;
    } catch (err) {
      this.set({ error: (err as Error).message });
      return false;
    } finally {
      this.set({ rejoining: false });
    }
  }

  /** Try to restore a seat saved in this tab (page refresh). */
  async resume(): Promise<boolean> {
    const saved = sessionStore.get();
    if (!saved) return false;
    this.set({ session: saved });
    return this.rejoin(saved.code, saved.token);
  }

  leave() {
    this.socket?.emit('room:leave');
    this.state.race?.dispose();
    sessionStore.set(null);
    this.set({ session: null, room: null, race: null, results: null, error: null });
  }

  ready(ready: boolean) {
    this.socket?.emit('room:ready', { ready });
  }
  selectCar(carId: string) {
    this.socket?.emit('player:select-car', { carId });
  }
  updateSettings(patch: Partial<RoomSettings>) {
    this.socket?.emit('room:update-settings', patch);
  }
  start() {
    this.set({ error: null });
    this.socket?.emit('room:start');
  }
  backToLobby() {
    this.socket?.emit('room:return-to-lobby');
    this.state.race?.dispose();
    this.set({ race: null, results: null });
  }
  clearMessages() {
    this.set({ error: null, notice: null });
  }
}

export const mp = new MultiplayerClient();
