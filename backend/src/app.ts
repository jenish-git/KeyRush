import { createServer, type Server as HttpServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/index';
import type { AppConfig } from './config/env';
import type { HistoryStore } from './persistence/store';
import { RoomManager, type RoomManagerOptions } from './rooms/RoomManager';
import { registerSocketHandlers } from './socket/handlers';
import { profileIdSchema, soloHistorySchema } from './validation/schemas';

export interface App {
  http: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  rooms: RoomManager;
  close(): Promise<void>;
}

export function createApp(config: AppConfig, store: HistoryStore, roomOptions: RoomManagerOptions = {}): App {
  const app = express();
  const http = createServer(app);
  const origin = config.clientOrigins.length ? config.clientOrigins : config.isProduction ? false : true;

  app.disable('x-powered-by');
  app.use(cors({ origin }));
  app.use(express.json({ limit: '32kb' }));

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    cors: { origin },
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000
  });
  const rooms = new RoomManager(io, store, roomOptions);
  registerSocketHandlers(io, rooms);

  // Simple per-IP limiter for the REST endpoints.
  const hits = new Map<string, { n: number; reset: number }>();
  app.use('/api', (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + 60_000 });
    else if (++h.n > 120) return res.status(429).json({ error: 'Too many requests' });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, store: store.kind, rooms: rooms.rooms.size, serverNow: Date.now() });
  });

  app.get('/api/history/:profileId', async (req, res) => {
    const id = profileIdSchema.safeParse(req.params.profileId);
    if (!id.success) return res.status(400).json({ error: 'Invalid profile id' });
    try {
      res.json({ entries: await store.list(id.data, 50) });
    } catch (err) {
      res.status(503).json({ error: 'History is temporarily unavailable' });
    }
  });

  // Solo races are simulated in the browser, so they are stored as self-reported.
  app.post('/api/history', async (req, res) => {
    const parsed = soloHistorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid race summary' });
    const { profileId, playerId, summary } = parsed.data;
    if (!summary.results.some((r) => r.id === playerId && !r.isBot)) return res.status(400).json({ error: 'Unknown player' });
    try {
      await store.save(profileId, { summary, playerId, source: 'client' });
      res.status(201).json({ ok: true });
    } catch {
      res.status(503).json({ error: 'History is temporarily unavailable' });
    }
  });

  if (config.staticDir && fs.existsSync(config.staticDir)) {
    const dir = path.resolve(config.staticDir);
    app.use(express.static(dir, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(dir, 'index.html')));
  }

  return {
    http,
    io,
    rooms,
    close: () =>
      new Promise((resolve) => {
        rooms.shutdown();
        io.close(() => resolve());
      })
  };
}
