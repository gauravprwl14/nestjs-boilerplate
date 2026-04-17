import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load .env files for CLI commands (NestJS doesn't load env for prisma CLI)
config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
config({ path: '.env' });

export default defineConfig({
  schema: path.join(__dirname, 'src', 'database', 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: 'ts-node --transpile-only --project prisma/tsconfig.json prisma/seed.ts',
  },
});
