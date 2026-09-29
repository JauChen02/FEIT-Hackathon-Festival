/** Explicitly enabled only in local/test servers; ignored in deployed environments. */
export function testClockOverride(
  value: string | null,
  environment: string | undefined,
  enabled: string | undefined,
): Date | null {
  if (!value || enabled !== '1' || (environment !== 'local' && environment !== 'test')) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
