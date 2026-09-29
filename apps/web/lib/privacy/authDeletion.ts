import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { deletionRequests } from '@learnarena/db';
import { db } from '../db';
export async function deleteAuthUser(userId: string, at: Date) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Auth administration is not configured');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error && error.status !== 404) throw new Error('Auth deletion will retry');
  await db()
    .update(deletionRequests)
    .set({ authDeletedAt: at })
    .where(eq(deletionRequests.userId, userId));
}
