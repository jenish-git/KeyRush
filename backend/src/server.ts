import { createApp } from './app';
import { loadConfig } from './config/env';
import { createStore } from './persistence/store';

const config = loadConfig();
const store = await createStore(config.mongoUri);
const app = createApp(config, store);

app.http.listen(config.port, () => {
  console.log(`[server] KeyRush API on http://localhost:${config.port} (history: ${store.kind})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
