import type { RaceSummary } from '@shared/index';
import { addLocalHistory, getProfileId, loadLocalHistory, type LocalHistoryEntry } from './storage';

const API = import.meta.env.VITE_API_URL ?? '';

/** Record a finished race locally, and (for solo races) best-effort on the server. */
export async function recordRace(summary: RaceSummary, playerId: string): Promise<void> {
  const source = summary.mode === 'solo' ? 'client' : 'server';
  addLocalHistory({ summary, playerId, source });
  if (summary.mode !== 'solo') return; // multiplayer results are stored by the server itself
  try {
    await fetch(`${API}/api/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: getProfileId(), playerId, summary })
    });
  } catch {
    /* offline: the local copy is enough */
  }
}

export async function fetchHistory(): Promise<{ entries: LocalHistoryEntry[]; serverOk: boolean }> {
  const local = loadLocalHistory();
  try {
    const res = await fetch(`${API}/api/history/${getProfileId()}`);
    if (!res.ok) throw new Error(String(res.status));
    const { entries } = (await res.json()) as { entries: LocalHistoryEntry[] };
    const byId = new Map<string, LocalHistoryEntry>();
    for (const e of [...entries, ...local]) if (!byId.has(e.summary.raceId)) byId.set(e.summary.raceId, e);
    const merged = [...byId.values()].sort((a, b) => b.summary.startedAt - a.summary.startedAt);
    return { entries: merged, serverOk: true };
  } catch {
    return { entries: local, serverOk: false };
  }
}
