/** Applies migrations to TEST_DATABASE_URL (the database the automated tests truncate). */
import { execSync } from 'node:child_process';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL in services/api/.env');
execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
