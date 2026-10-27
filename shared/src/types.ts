import type { CarStatus } from './racing/car';
import type { Difficulty } from './bots/bot';

export type RoomStatus = 'WAITING' | 'COUNTDOWN' | 'RACING' | 'FINISHED' | 'CLOSED';
export type RacerStatus = 'racing' | 'disconnected' | 'abandoned';

/** Live per-racer data broadcast during a race (small, ~10 Hz). */
export interface RacerSnapshot {
  id: string;
  distance: number;
  speed: number;
  carStatus: CarStatus;
  effectiveWpm: number;
  accuracy: number;
  progress: number;
  crashes: number;
  falseStart: boolean;
  status: RacerStatus;
}

export interface RacerInfo {
  id: string;
  name: string;
  carId: string;
  isBot: boolean;
}

export interface RaceResult {
  position: number;
  id: string;
  name: string;
  carId: string;
  isBot: boolean;
  effectiveWpm: number;
  rawWpm: number;
  accuracy: number;
  correctChars: number;
  totalErrors: number;
  correctedErrors: number;
  uncorrectedErrors: number;
  distance: number;
  crashes: number;
  falseStart: boolean;
  status: RacerStatus;
  raceTimeMs: number;
}

export interface RaceSummary {
  raceId: string;
  mode: 'solo' | 'multiplayer';
  roomCode?: string;
  difficulty?: Difficulty;
  durationMin: number;
  startedAt: number;
  results: RaceResult[];
}

export interface LobbyPlayer {
  id: string;
  name: string;
  carId: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomSettings {
  durationMin: number;
  maxPlayers: number;
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  hostId: string;
  settings: RoomSettings;
  players: LobbyPlayer[];
  lastResults?: RaceSummary;
}

/** Everything a client needs to render a race; sent before the countdown and on resync. */
export interface RaceSetup {
  raceId: string;
  text: string;
  durationMs: number;
  /** Server-clock timestamps. lights[i] = moment light i turns on. */
  lightsAt: number[];
  startAt: number;
  endAt: number;
  racers: RacerInfo[];
}
