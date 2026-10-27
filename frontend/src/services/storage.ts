// Safe localStorage/sessionStorage wrappers: storage can be unavailable
// (private mode, blocked site data), and the game must work regardless.

import type { RaceSummary } from '@shared/index';
import { DEFAULT_CAR_ID } from '@shared/index';

function read<T>(store: () => Storage, key: string, fallback: T): T {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(store: () => Storage, key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) store().removeItem(key);
    else store().setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

export interface Preferences {
  name: string;
  carId: string;
  sound: boolean;
  reducedMotion: 'auto' | 'on' | 'off';
}

export function getProfileId(): string {
  let id = read<string | null>(local, 'keyrush.profileId', null);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    write(local, 'keyrush.profileId', id);
  }
  return id;
}

export function loadPrefs(): Preferences {
  return { name: '', carId: DEFAULT_CAR_ID, sound: true, reducedMotion: 'auto', ...read(local, 'keyrush.prefs', {}) };
}

export function savePrefs(p: Preferences): void {
  write(local, 'keyrush.prefs', p);
}

export interface StoredSession {
  code: string;
  playerId: string;
  token: string;
}

export const sessionStore = {
  get: () => read<StoredSession | null>(session, 'keyrush.session', null),
  set: (s: StoredSession | null) => write(session, 'keyrush.session', s)
};

export interface LocalHistoryEntry {
  summary: RaceSummary;
  playerId: string;
  source: 'server' | 'client';
}

export function loadLocalHistory(): LocalHistoryEntry[] {
  return read<LocalHistoryEntry[]>(local, 'keyrush.history', []);
}

export function addLocalHistory(entry: LocalHistoryEntry): void {
  const list = loadLocalHistory().filter((e) => e.summary.raceId !== entry.summary.raceId);
  list.unshift(entry);
  write(local, 'keyrush.history', list.slice(0, 100));
}

export function recentSoloThemes(): string[] {
  return read<string[]>(local, 'keyrush.recentThemes', []);
}

export function setRecentSoloThemes(themes: string[]): void {
  write(local, 'keyrush.recentThemes', themes.slice(0, 3));
}
