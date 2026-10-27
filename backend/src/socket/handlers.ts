import type { Server, Socket } from 'socket.io';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { NET, type Ack, type ClientToServerEvents, type ServerToClientEvents } from '@shared/index';
import { RoomError, type RoomManager } from '../rooms/RoomManager';
import {
  createRoomSchema,
  inputSchema,
  joinRoomSchema,
  profileIdSchema,
  readySchema,
  rejoinSchema,
  selectCarSchema,
  updateSettingsSchema
} from '../validation/schemas';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

function message(err: unknown): string {
  if (err instanceof RoomError) return err.message;
  if (err instanceof ZodError) return err.issues[0]?.message ?? 'Invalid request';
  console.error('[socket] unexpected error', err);
  return 'Something went wrong';
}

/** Per-IP sliding-window limiter for room creation. */
function createLimiter() {
  const createLog = new Map<string, number[]>();
  return function allowCreate(ip: string): boolean {
    const now = Date.now();
    const recent = (createLog.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= NET.CREATE_ROOM_PER_MIN) {
      createLog.set(ip, recent);
      return false;
    }
    recent.push(now);
    createLog.set(ip, recent);
    return true;
  };
}

export function registerSocketHandlers(io: IO, rooms: RoomManager) {
  const allowCreate = createLimiter();
  io.on('connection', (socket: Sock) => {
    const profile = profileIdSchema.safeParse(socket.handshake.auth?.profileId);
    (socket.data as any).profileId = profile.success ? profile.data : null;

    /** Wrap an ack-style handler with validation and error reporting. */
    function withAck<S extends ZodTypeAny, T>(schema: S, fn: (p: z.output<S>) => T) {
      return (payload: unknown, ack: Ack<T>) => {
        if (typeof ack !== 'function') return;
        try {
          ack({ ok: true, data: fn(schema.parse(payload)) });
        } catch (err) {
          ack({ ok: false, error: message(err) });
        }
      };
    }

    /** Wrap a fire-and-forget handler; errors go back as room:error. */
    function guarded<S extends ZodTypeAny>(schema: S | null, fn: (p: z.output<S>) => void) {
      return (payload?: unknown) => {
        try {
          fn(schema ? schema.parse(payload) : (undefined as any));
        } catch (err) {
          socket.emit('room:error', message(err));
        }
      };
    }

    socket.on('time:sync', (_clientSentAt, ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    socket.on(
      'room:create',
      withAck(createRoomSchema, (p) => {
        if (!allowCreate(socket.handshake.address)) throw new RoomError('Too many rooms created. Please wait a minute.');
        return rooms.create(socket, p.name, p.carId, p.settings);
      })
    );
    socket.on('room:join', withAck(joinRoomSchema, (p) => rooms.join(socket, p.code, p.name, p.carId)));
    socket.on('room:rejoin', withAck(rejoinSchema, (p) => rooms.rejoin(socket, p.code, p.token)));
    socket.on('room:leave', guarded(null, () => rooms.leave(socket)));
    socket.on('room:ready', guarded(readySchema, (p) => rooms.setReady(socket, p.ready)));
    socket.on('room:update-settings', guarded(updateSettingsSchema, (p) => rooms.updateSettings(socket, p)));
    socket.on('room:start', guarded(null, () => rooms.start(socket)));
    socket.on('room:return-to-lobby', guarded(null, () => rooms.returnToLobby(socket)));
    socket.on('player:select-car', guarded(selectCarSchema, (p) => rooms.selectCar(socket, p.carId)));
    socket.on('race:request-state', guarded(null, () => rooms.requestState(socket)));
    socket.on('race:input', (payload) => {
      const parsed = inputSchema.safeParse(payload);
      if (!parsed.success) return; // silently drop malformed input
      try {
        rooms.input(socket, parsed.data.seq, parsed.data.ops);
      } catch {
        /* not in a race: ignore */
      }
    });

    socket.on('disconnect', () => rooms.disconnected(socket));
  });
}
