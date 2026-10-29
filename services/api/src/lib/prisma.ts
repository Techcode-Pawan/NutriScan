import { PrismaClient } from '@prisma/client';

// One client per process; Prisma maintains its own connection pool
// (size configurable with ?connection_limit= on DATABASE_URL).
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
