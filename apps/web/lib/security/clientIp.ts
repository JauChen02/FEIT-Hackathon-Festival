import 'server-only';
import { createHash } from 'node:crypto';
/** Only trust the forwarding header when the deployment's trusted proxy is configured. */
export function clientIpKey(request: Request) {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER;
  const ip = header ? request.headers.get(header)?.split(',')[0]?.trim() : null;
  return createHash('sha256')
    .update(ip ?? 'unconfigured-proxy')
    .digest('hex');
}
