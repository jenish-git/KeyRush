import { z } from 'zod';
import { CARS, NET, RACE_DURATIONS_MIN, ROOM } from '@shared/index';

const carIds = CARS.map((c) => c.id) as [string, ...string[]];

/** Strip control characters and markup, collapse whitespace, cap length. */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ROOM.NAME_MAX);
}

export const nameSchema = z
  .string()
  .max(64)
  .transform(sanitizeName)
  .refine((s) => s.length >= 1, 'Please enter a display name');

export const carSchema = z.enum(carIds).catch(CARS[0].id);

export const durationSchema = z
  .number()
  .refine((n) => (RACE_DURATIONS_MIN as readonly number[]).includes(n), 'Unsupported race duration');

export const settingsSchema = z.object({
  durationMin: durationSchema,
  maxPlayers: z.number().int().min(ROOM.MIN_PLAYERS).max(ROOM.MAX_PLAYERS_LIMIT)
});

export const codeSchema = z
  .string()
  .max(16)
  .transform((s) => s.replace(/[^a-z0-9]/gi, '').toUpperCase())
  .refine((s) => s.length === ROOM.CODE_LENGTH, 'Room codes have 5 characters');

export const createRoomSchema = z.object({ name: nameSchema, carId: carSchema, settings: settingsSchema });
export const joinRoomSchema = z.object({ code: codeSchema, name: nameSchema, carId: carSchema });
export const rejoinSchema = z.object({ code: codeSchema, token: z.string().min(16).max(128) });
export const readySchema = z.object({ ready: z.boolean() });
export const selectCarSchema = z.object({ carId: z.enum(carIds) });
export const updateSettingsSchema = settingsSchema.partial();
export const inputSchema = z.object({
  seq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  ops: z.string().min(1).max(NET.MAX_OPS_PER_MESSAGE)
});

export const profileIdSchema = z.string().regex(/^[a-zA-Z0-9-]{8,64}$/);

const resultSchema = z.object({
  position: z.number(),
  id: z.string().max(64),
  name: z.string().max(64).transform(sanitizeName),
  carId: z.string().max(32),
  isBot: z.boolean(),
  effectiveWpm: z.number().min(0).max(400),
  rawWpm: z.number().min(0).max(400),
  accuracy: z.number().min(0).max(100),
  correctChars: z.number().min(0),
  totalErrors: z.number().min(0),
  correctedErrors: z.number().min(0),
  uncorrectedErrors: z.number().min(0),
  distance: z.number().min(0),
  crashes: z.number().min(0),
  falseStart: z.boolean(),
  status: z.enum(['racing', 'disconnected', 'abandoned']),
  raceTimeMs: z.number().min(0)
});

export const soloHistorySchema = z.object({
  profileId: profileIdSchema,
  playerId: z.string().max(64),
  summary: z.object({
    raceId: z.string().max(64),
    mode: z.literal('solo'),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    durationMin: durationSchema,
    startedAt: z.number(),
    results: z.array(resultSchema).min(1).max(10)
  })
});
