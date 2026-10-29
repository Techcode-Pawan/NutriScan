import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { shutdownOcr } from './modules/ocr/ocr.service.js';

async function main() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error(
      'Cannot connect to PostgreSQL. Check that the database is running and DATABASE_URL in services/api/.env is correct.\n' +
        `  ${(e as Error).message.split('\n').slice(-1)[0]}`,
    );
    process.exit(1);
  }
  const products = await prisma.product.count();
  if (products === 0) console.warn('The products table is empty. Run `npm run etl && npm run data:import` (or `npm run data:sample`).');

  const server = createApp().listen(env.PORT, '0.0.0.0', () => {
    console.log(`NutriScan API listening on http://localhost:${env.PORT} (${products} products)`);
  });

  const shutdown = async () => {
    server.close();
    await shutdownOcr();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
