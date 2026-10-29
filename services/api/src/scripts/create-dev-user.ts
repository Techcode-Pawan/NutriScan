/**
 * Creates (or resets) a development account for demos. The password is generated randomly and
 * written to services/api/.dev-credentials (git-ignored), never hard-coded in the source.
 * Usage: npm run dev:user [-- --email demo@nutriscan.local]
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import '../config/env.js';
import { API_ROOT } from '../config/paths.js';
import { prisma } from '../lib/prisma.js';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to create a development user in production.');
  const i = process.argv.indexOf('--email');
  const email = (i >= 0 ? process.argv[i + 1] : 'demo@nutriscan.local').toLowerCase();
  const password = `Demo-${randomBytes(6).toString('base64url')}9`;
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, displayName: 'Demo user', preferences: { create: { lowSugar: true } } },
    update: { passwordHash, tokenVersion: { increment: 1 } },
  });
  const file = path.join(API_ROOT, '.dev-credentials');
  writeFileSync(file, `email=${email}\npassword=${password}\n`);
  console.log(`Development user ${email} is ready. Credentials written to ${file}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
