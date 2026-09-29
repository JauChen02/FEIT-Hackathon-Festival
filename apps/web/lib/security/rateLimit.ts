import 'server-only';
import { AppError, systemClock, uuidv7, type Clock } from '@learnarena/core';
import { redisClient } from '../leaderboards/service';
import { logger } from '../logger';
// Exact sliding window. Atomic on both Redis and Upstash; no provider-specific Lua flags.
const script = `local key=KEYS[1]
local now=tonumber(ARGV[1])
local window=tonumber(ARGV[2])
local maximum=tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE',key,'-inf',now-window)
local count=redis.call('ZCARD',key)
if count>=maximum then
 local first=redis.call('ZRANGE',key,0,0,'WITHSCORES')
 return {0,math.max(1,math.ceil((tonumber(first[2])+window-now)/1000))}
end
redis.call('ZADD',key,now,ARGV[4])
redis.call('PEXPIRE',key,window)
return {1,0}`;
export async function rateLimit(
  userId: string,
  action: 'session' | 'answer' | 'friend' | 'lobby' | 'lobby-ip',
  clock: Clock = systemClock,
) {
  const redis = redisClient();
  const failClosed = action === 'friend' || action.startsWith('lobby');
  if (!redis) {
    logger.warn({ action }, 'ratelimit.degraded');
    if (failClosed) throw new AppError('RATE_LIMITED', { message: 'Please try again shortly.' });
    return;
  }
  const [maximum, window] =
    action === 'session'
      ? [30, 3600000]
      : action === 'answer'
        ? [5, 1000]
        : action === 'friend'
          ? [20, 86400000]
          : [action === 'lobby' ? 10 : 30, 60000];
  try {
    const result = await redis.eval<unknown[], [number, number]>(
      script,
      [`learnarena:limit:${action}:${userId}`],
      [clock.now().getTime(), window!, maximum!, uuidv7()],
    );
    if (result[0] === 0) throw new AppError('RATE_LIMITED', { details: { retryAfter: result[1] } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn({ action }, 'ratelimit.degraded');
    if (failClosed) throw new AppError('RATE_LIMITED', { message: 'Please try again shortly.' });
  }
}
