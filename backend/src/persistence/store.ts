// Race history persistence. MongoDB when MONGODB_URI is set, otherwise an
// in-memory store so the game runs locally with zero setup. Persistence is
// always best-effort: a failing database never blocks results.

import mongoose, { Schema } from 'mongoose';
import type { RaceSummary } from '@shared/index';

export interface HistoryEntry {
  summary: RaceSummary;
  /** Which result row belongs to the profile. */
  playerId: string;
  /** 'server' results were computed authoritatively; 'client' are self-reported solo races. */
  source: 'server' | 'client';
}

export interface HistoryStore {
  readonly kind: string;
  save(profileId: string, entry: HistoryEntry): Promise<void>;
  list(profileId: string, limit: number): Promise<HistoryEntry[]>;
}

export class MemoryStore implements HistoryStore {
  readonly kind = 'memory';
  private data = new Map<string, HistoryEntry[]>();
  async save(profileId: string, entry: HistoryEntry) {
    const list = this.data.get(profileId) ?? [];
    if (list.some((e) => e.summary.raceId === entry.summary.raceId)) return; // no duplicate submissions
    list.unshift(entry);
    this.data.set(profileId, list.slice(0, 200));
  }
  async list(profileId: string, limit: number) {
    return (this.data.get(profileId) ?? []).slice(0, limit);
  }
}

const recordSchema = new Schema(
  {
    profileId: { type: String, index: true, required: true },
    raceId: { type: String, required: true },
    playerId: String,
    source: String,
    summary: Schema.Types.Mixed
  },
  { timestamps: true }
);
recordSchema.index({ profileId: 1, raceId: 1 }, { unique: true });

export class MongoStore implements HistoryStore {
  readonly kind = 'mongodb';
  private model = mongoose.models.RaceRecord ?? mongoose.model('RaceRecord', recordSchema);
  async save(profileId: string, entry: HistoryEntry) {
    await this.model.updateOne(
      { profileId, raceId: entry.summary.raceId },
      { $setOnInsert: { profileId, raceId: entry.summary.raceId, playerId: entry.playerId, source: entry.source, summary: entry.summary } },
      { upsert: true }
    );
  }
  async list(profileId: string, limit: number) {
    const docs = await this.model.find({ profileId }).sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map((d: any) => ({ summary: d.summary, playerId: d.playerId, source: d.source }));
  }
}

export async function createStore(mongoUri: string | undefined): Promise<HistoryStore> {
  if (!mongoUri) return new MemoryStore();
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 4000 });
    console.log('[store] connected to MongoDB');
    return new MongoStore();
  } catch (err) {
    console.warn('[store] MongoDB unavailable, falling back to in-memory history:', (err as Error).message);
    return new MemoryStore();
  }
}
