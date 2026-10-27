import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  RaceSetup,
  RaceSummary,
  RoomView,
  SelfState,
  ServerToClientEvents,
  SessionInfo
} from '@shared/index';
import { createApp, type App } from '../src/app';
import { MemoryStore } from '../src/persistence/store';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const RACE_MS = 2_500;
let app: App;
let url: string;
let store: MemoryStore;
const clients: Client[] = [];

beforeEach(async () => {
  store = new MemoryStore();
  app = createApp({ port: 0, clientOrigins: [], mongoUri: undefined, isProduction: false, staticDir: undefined }, store, {
    schedule: (now) => ({ lightsAt: [1, 2, 3, 4, 5].map((i) => now + i * 40), startAt: now + 400 }),
    durationMs: () => RACE_MS,
    lobbyGraceMs: 300,
    raceGraceMs: 300
  });
  await new Promise<void>((r) => app.http.listen(0, r));
  url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await app.close();
});

function client(profileId?: string): Promise<Client> {
  const c: Client = connect(url, { transports: ['websocket'], auth: profileId ? { profileId } : {}, forceNew: true });
  clients.push(c);
  return new Promise((resolve) => c.on('connect', () => resolve(c)));
}

function call<T>(c: Client, event: 'room:create' | 'room:join' | 'room:rejoin', payload: any): Promise<{ ok: boolean; data?: T; error?: string }> {
  return new Promise((resolve) => (c.emit as any)(event, payload, resolve));
}

function next<E extends keyof ServerToClientEvents>(c: Client, event: E, pred: (...a: any[]) => boolean = () => true): Promise<any> {
  return new Promise((resolve) => {
    const h = (...args: any[]) => {
      if (pred(...args)) {
        c.off(event, h as any);
        resolve(args[0]);
      }
    };
    c.on(event, h as any);
  });
}

const settings = { durationMin: 1, maxPlayers: 3 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lobbyOfTwo() {
  const host = await client('host-profile-1');
  const guest = await client('guest-profile-1');
  const created = await call<SessionInfo>(host, 'room:create', { name: 'Host', carId: 'scarlet', settings });
  const joined = await call<SessionInfo>(guest, 'room:join', { code: created.data!.code.toLowerCase(), name: 'Guest', carId: 'ocean' });
  return { host, guest, hostSession: created.data!, guestSession: joined.data!, joined };
}

async function startRace(host: Client, guest: Client) {
  const ready = next(host, 'room:updated', (r: RoomView) => r.players.every((p) => p.ready));
  guest.emit('room:ready', { ready: true });
  await ready;
  const setups = Promise.all([next(host, 'race:countdown'), next(guest, 'race:countdown')]);
  host.emit('room:start');
  return (await setups) as [RaceSetup, RaceSetup];
}

describe('rooms', () => {
  it('creates a unique, unambiguous code and lets another client join case-insensitively', async () => {
    const { hostSession, joined } = await lobbyOfTwo();
    expect(hostSession.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/);
    expect(joined.ok).toBe(true);
    expect(joined.data!.code).toBe(hostSession.code);
  });

  it('rejects invalid codes with a useful error', async () => {
    const c = await client();
    const bad = await call(c, 'room:join', { code: 'ZZZZZ', name: 'X', carId: 'scarlet' });
    expect(bad).toEqual({ ok: false, error: expect.stringMatching(/not found/i) });
    const malformed = await call(c, 'room:join', { code: 'AB', name: 'X', carId: 'scarlet' });
    expect(malformed.ok).toBe(false);
  });

  it('rejects players beyond the room limit', async () => {
    const { hostSession } = await lobbyOfTwo();
    const third = await client();
    expect((await call(third, 'room:join', { code: hostSession.code, name: 'C', carId: 'volt' })).ok).toBe(true);
    const fourth = await client();
    const res = await call(fourth, 'room:join', { code: hostSession.code, name: 'D', carId: 'volt' });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/full/i) });
  });

  it('sanitizes and de-duplicates display names', async () => {
    const host = await client();
    const created = await call<SessionInfo>(host, 'room:create', { name: '  <b>Max</b>  ', carId: 'scarlet', settings });
    const other = await client();
    const update = next(other, 'room:updated');
    await call(other, 'room:join', { code: created.data!.code, name: 'bMax/b', carId: 'scarlet' });
    const room: RoomView = await update;
    expect(room.players.map((p) => p.name)).toEqual(['bMax/b', 'bMax/b 2']);
  });

  it('only the host can change settings or start', async () => {
    const { host, guest } = await lobbyOfTwo();
    const err = next(guest, 'room:error');
    guest.emit('room:update-settings', { durationMin: 5 });
    expect(await err).toMatch(/host/i);
    const err2 = next(guest, 'room:error');
    guest.emit('room:start');
    expect(await err2).toMatch(/host/i);
    const upd = next(host, 'room:updated', (r: RoomView) => r.settings.durationMin === 3);
    host.emit('room:update-settings', { durationMin: 3 });
    expect((await upd).settings.durationMin).toBe(3);
    const bad = next(host, 'room:error');
    host.emit('room:update-settings', { durationMin: 7 });
    expect(await bad).toMatch(/duration/i);
  });

  it('requires everyone to be ready before starting', async () => {
    const { host } = await lobbyOfTwo();
    const err = next(host, 'room:error');
    host.emit('room:start');
    expect(await err).toMatch(/ready/i);
  });

  it('transfers host when the host leaves the lobby', async () => {
    const { host, guest, guestSession } = await lobbyOfTwo();
    const upd = next(guest, 'room:updated', (r: RoomView) => r.players.length === 1);
    host.emit('room:leave');
    const room: RoomView = await upd;
    expect(room.hostId).toBe(guestSession.playerId);
  });
});

describe('races', () => {
  it('gives every player the same passage, duration and start schedule', async () => {
    const { host, guest } = await lobbyOfTwo();
    const [a, b] = await startRace(host, guest);
    expect(a.text).toBe(b.text);
    expect(a.text.length).toBeGreaterThan(500);
    expect(a.durationMs).toBe(b.durationMs);
    expect(a.startAt).toBe(b.startAt);
    expect(a.lightsAt).toEqual(b.lightsAt);
  });

  it('penalises a false start', async () => {
    const { host, guest, guestSession } = await lobbyOfTwo();
    const [setup] = await startRace(host, guest);
    const ev = next(host, 'race:event', (e) => e.type === 'false-start');
    guest.emit('race:input', { seq: 1, ops: setup.text[0] });
    expect((await ev).playerId).toBe(guestSession.playerId);
  });

  it('scores authoritative progress, ignores duplicates and ends with identical results', async () => {
    const { host, guest, hostSession } = await lobbyOfTwo();
    const [setup] = await startRace(host, guest);
    await wait(setup.startAt - Date.now() + 30);
    // Host types 20 correct characters, sending one batch twice (duplicate seq).
    host.emit('race:input', { seq: 1, ops: setup.text.slice(0, 10) });
    host.emit('race:input', { seq: 1, ops: setup.text.slice(0, 10) });
    host.emit('race:input', { seq: 2, ops: setup.text.slice(10, 20) });
    // A fabricated "result" event is not part of the protocol and is ignored.
    (host as any).emit('race:finished', { results: [{ id: 'x', position: 1 }] });

    const selfP = next(host, 'race:self');
    host.emit('race:request-state');
    const self: { self: SelfState } = await selfP;
    expect(self.self.lastSeq).toBe(2);
    expect(self.self.typing.lock + self.self.typing.entries.length).toBe(20);

    const [ra, rb] = (await Promise.all([next(host, 'race:finished'), next(guest, 'race:finished')])) as [RaceSummary, RaceSummary];
    expect(ra).toEqual(rb);
    expect(ra.results[0].id).toBe(hostSession.playerId);
    expect(ra.results[0].correctChars).toBe(20);
    expect(ra.results[1].correctChars).toBe(0);
    await wait(50);
    expect((await store.list('host-profile-1', 10))[0].summary.raceId).toBe(ra.raceId);
  });

  it('rejects input after the race has finished', async () => {
    const { host, guest } = await lobbyOfTwo();
    const [setup] = await startRace(host, guest);
    const done = await next(host, 'race:finished');
    host.emit('race:input', { seq: 1, ops: setup.text.slice(0, 5) });
    await wait(100);
    expect(done.results.every((r: any) => r.correctChars === 0)).toBe(true);
  });

  it('keeps racing when a player disconnects, and a reconnect cannot reset progress', async () => {
    const { host, guest, guestSession } = await lobbyOfTwo();
    const [setup] = await startRace(host, guest);
    await wait(setup.startAt - Date.now() + 30);
    guest.emit('race:input', { seq: 1, ops: setup.text.slice(0, 8) });
    await wait(100);
    guest.disconnect();
    const states: any[] = [];
    host.on('race:state', (s) => states.push(s));
    await wait(150);
    expect(states.length).toBeGreaterThan(0);

    const back = await client();
    const countdown = next(back, 'race:countdown');
    const selfP = next(back, 'race:self');
    const res = await call<SessionInfo>(back, 'room:rejoin', { code: guestSession.code, token: guestSession.token });
    expect(res.ok).toBe(true);
    expect((await countdown).startAt).toBe(setup.startAt);
    const self: { self: SelfState } = await selfP;
    expect(self.self.typing.lock + self.self.typing.entries.length).toBe(8);
    expect(self.self.lastSeq).toBe(1);

    // Replaying an old sequence number does not score again.
    back.emit('race:input', { seq: 1, ops: setup.text.slice(0, 8) });
    const summary: RaceSummary = await next(back, 'race:finished');
    expect(summary.results.find((r) => r.id === guestSession.playerId)!.correctChars).toBe(8);
  });

  it('rejects a reconnect with a forged token', async () => {
    const { guestSession } = await lobbyOfTwo();
    const thief = await client();
    const res = await call(thief, 'room:rejoin', { code: guestSession.code, token: 'x'.repeat(32) });
    expect(res.ok).toBe(false);
  });

  it('returns to the lobby without carrying progress into the next race', async () => {
    const { host, guest } = await lobbyOfTwo();
    const [setup] = await startRace(host, guest);
    await wait(setup.startAt - Date.now() + 30);
    host.emit('race:input', { seq: 1, ops: setup.text.slice(0, 6) });
    await next(host, 'race:finished');
    const lobby = next(host, 'room:updated', (r: RoomView) => r.status === 'WAITING');
    host.emit('room:return-to-lobby');
    await lobby;
    const [setup2] = await startRace(host, guest);
    expect(setup2.raceId).not.toBe(setup.raceId);
    const summary: RaceSummary = await next(host, 'race:finished');
    expect(summary.results.every((r) => r.correctChars === 0)).toBe(true);
  });
});
