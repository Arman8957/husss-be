// src/main.ts
import 'dotenv/config';
import { bootstrap } from './bootstrap';

bootstrap().catch((err) => {
  console.error('FATAL: Application failed to start:', err);
  process.exit(1);
});