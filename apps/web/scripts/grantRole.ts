import '@learnarena/db/loadEnv';
import { findUserByUsername, getDatabase, userRoles } from '@learnarena/db';
const username = process.argv[2],
  role = process.argv[3] ?? 'ADMIN';
if (!username || !['ADMIN', 'AUTHOR', 'REVIEWER'].includes(role))
  throw new Error('Usage: pnpm admin:grant-role <username> [ADMIN|AUTHOR|REVIEWER]');
const handle = getDatabase();
try {
  const user = await findUserByUsername(handle.db, username);
  if (!user) throw new Error('Sign in and complete onboarding before assigning a role.');
  await handle.db
    .insert(userRoles)
    .values({ userId: user.id, role: role as 'ADMIN' | 'AUTHOR' | 'REVIEWER' })
    .onConflictDoNothing();
  console.log(`Granted ${role} to ${username}.`);
} finally {
  await handle.close();
}
