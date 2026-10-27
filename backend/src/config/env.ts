export interface AppConfig {
  port: number;
  /** Allowed browser origins. Empty = allow all (development only). */
  clientOrigins: string[];
  mongoUri: string | undefined;
  isProduction: boolean;
  /** Directory of a built frontend to serve (production single-service deploy). */
  staticDir: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  const origins = (env.CLIENT_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    // Hosting platforms inject PORT in production; in development PORT often
    // belongs to the frontend dev server, so only API_PORT is used there.
    port: Number(env.API_PORT ?? (isProduction ? env.PORT : undefined) ?? 4000),
    clientOrigins: origins,
    mongoUri: env.MONGODB_URI || undefined,
    isProduction,
    staticDir: env.STATIC_DIR || undefined
  };
}
