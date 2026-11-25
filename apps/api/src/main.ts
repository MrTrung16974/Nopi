import { createApp } from './bootstrap.js';
import { loadConfig } from './platform/config.js';

const config = loadConfig();
const app = await createApp(config);
await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
console.log(`Nopi API chạy tại http://localhost:${config.API_PORT}/v1`);
