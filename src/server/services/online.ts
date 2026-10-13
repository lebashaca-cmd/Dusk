/** Who has the site open right now. Browsers check in every 30 seconds; anyone silent for 70 seconds is gone. */
const seen = new Map<string, number>();
const WINDOW_MS = 70_000;

export function checkIn(id: string): void {
  seen.set(id, Date.now());
  if (seen.size > 5_000) prune();
}

function prune(): void {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [id, at] of seen) if (at < cutoff) seen.delete(id);
}

export function onlineCount(): number {
  prune();
  return seen.size;
}
