/** Server-authoritative timing — the only clock that decides whether an
 * attempt is still open. Client countdowns are cosmetic; every write path
 * re-checks this. */

export function computeServerEndAt(durationSeconds: number, startedAt: Date): Date {
  return new Date(startedAt.getTime() + durationSeconds * 1000);
}

export function isExpired(serverEndAt: Date, now: Date = new Date()): boolean {
  return now.getTime() > serverEndAt.getTime();
}
