import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
const claimsSchema = z
  .object({
    userId: z.string().uuid(),
    lobbyId: z.string().uuid(),
    kind: z.enum(['handshake', 'reconnect']),
    exp: z.number().int(),
    matchId: z.string().uuid().optional(),
  })
  .strict();
export type RealtimeClaims = z.infer<typeof claimsSchema>;
function secret() {
  const value = process.env.REALTIME_TOKEN_SECRET;
  if (!value || value.length < 32)
    throw new Error('REALTIME_TOKEN_SECRET must contain at least 32 characters');
  return value;
}
export function signRealtimeToken(claims: RealtimeClaims) {
  const body = Buffer.from(JSON.stringify(claimsSchema.parse(claims))).toString('base64url');
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`;
}
export function verifyRealtimeToken(token: string, now: Date): RealtimeClaims {
  if (token.length > 2048) throw new Error('Invalid token');
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) throw new Error('Invalid token');
  const expected = createHmac('sha256', secret()).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('Invalid token');
  const claims = claimsSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString()));
  if (claims.exp <= now.getTime()) throw new Error('Expired token');
  return claims;
}
