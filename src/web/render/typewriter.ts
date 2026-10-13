/**
 * Cycles through bio lines by deleting one and typing the next.
 * The first line is already on screen, so the page never looks empty. Returns a function that stops it.
 */
export function startTypewriter(el: HTMLElement | null, lines: string[]): () => void {
  if (!el || lines.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  let line = 0;
  let chars = lines[0]?.length ?? 0;
  let deleting = true;
  let timer = 0;

  const tick = (): void => {
    const text = lines[line] ?? "";
    el.textContent = text.slice(0, chars);
    let wait = deleting ? 26 : 55;
    if (!deleting && chars === text.length) { deleting = true; wait = 1900; }
    else if (deleting && chars === 0) { deleting = false; line = (line + 1) % lines.length; wait = 350; }
    else chars += deleting ? -1 : 1;
    timer = window.setTimeout(tick, wait);
  };

  timer = window.setTimeout(tick, 1900);
  return () => window.clearTimeout(timer);
}
