import { esc } from "../util/dom";

/** One line of lyrics as words, so each word can light up in turn while its line is sung. */
export function lineHTML(text: string): string {
  const t = text.trim();
  if (!t) return "♪";
  return t.split(/\s+/).map(w => `<span class="w" data-t="${esc(w)}">${esc(w)}</span>`).join(" ");
}

/** Marks the line being sung, the ones already sung, and how far every other line is from it (the farther, the softer). */
export function paintLines(lines: readonly HTMLElement[], cur: number): void {
  lines.forEach((el, n) => {
    el.classList.toggle("cur", n === cur);
    el.classList.toggle("past", n < cur);
    el.style.setProperty("--d", String(Math.min(4, Math.abs(n - cur))));
  });
}

/**
 * Lights the words of the current line from left to right across the time the line lasts.
 * `elapsed` is how far into the line the song already is, so a line that is joined late starts part-way.
 */
export function sweepLine(line: HTMLElement | undefined, elapsed: number, dur: number): void {
  if (!line) return;
  const words = [...line.querySelectorAll<HTMLElement>(".w")];
  const len = Math.max(0.4, dur);
  const each = len / Math.max(1, words.length);
  words.forEach((w, n) => {
    w.style.animationDuration = `${each.toFixed(3)}s`;
    w.style.animationDelay = `${(n * each - Math.max(0, elapsed)).toFixed(3)}s`;
  });
}

/** How long a line lasts: until the next one starts, or a few seconds for the last. */
export function lineSpan(times: readonly number[], i: number): number {
  const next = times[i + 1];
  const t = times[i];
  if (t === undefined) return 3;
  return next !== undefined ? Math.min(12, Math.max(0.4, next - t)) : 4;
}
