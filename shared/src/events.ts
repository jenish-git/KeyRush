// Typed Socket.IO protocol shared by client and server.

import type { RaceSetup, RaceSummary, RacerSnapshot, RoomSettings, RoomView } from './types';
import type { TypingState } from './typing/engine';

export interface SessionInfo {
  code: string;
  playerId: string;
  /** Secret reconnect token; never broadcast to other players. */
  token: string;
}

export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'time:sync': (clientSentAt: number, ack: (serverNow: number) => void) => void;
  'room:create': (p: { name: string; carId: string; settings: RoomSettings }, ack: Ack<SessionInfo>) => void;
  'room:join': (p: { code: string; name: string; carId: string }, ack: Ack<SessionInfo>) => void;
  'room:rejoin': (p: { code: string; token: string }, ack: Ack<SessionInfo>) => void;
  'room:leave': () => void;
  'room:ready': (p: { ready: boolean }) => void;
  'room:update-settings': (p: Partial<RoomSettings>) => void;
  'room:start': () => void;
  'room:return-to-lobby': () => void;
  'player:select-car': (p: { carId: string }) => void;
  'race:input': (p: { seq: number; ops: string }) => void;
  'race:request-state': () => void;
}

export interface SelfState {
  typing: TypingState;
  lastSeq: number;
  falseStart: boolean;
  lockedUntil: number;
}

export interface ServerToClientEvents {
  'room:updated': (room: RoomView) => void;
  'room:error': (message: string) => void;
  'room:closed': (reason: string) => void;
  'race:countdown': (setup: RaceSetup) => void;
  'race:passage-extend': (p: { raceId: string; from: number; text: string }) => void;
  'race:state': (p: { raceId: string; serverNow: number; racers: RacerSnapshot[] }) => void;
  /** Authoritative state of the receiving player (on resync, rejection or reconnect). */
  'race:self': (p: { raceId: string; self: SelfState }) => void;
  'race:event': (p: { raceId: string; type: 'crash' | 'false-start'; playerId: string }) => void;
  'race:finished': (summary: RaceSummary) => void;
  'player:disconnected': (p: { playerId: string }) => void;
  'player:reconnected': (p: { playerId: string }) => void;
}
