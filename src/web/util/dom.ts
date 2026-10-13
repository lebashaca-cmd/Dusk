const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text before putting it inside an HTML string. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, c => ESCAPES[c] ?? c);
}

export function $<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function $$<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/** Like $, but for elements the code itself just rendered: a missing one is a bug, so fail loudly. */
export function must<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

/**
 * One listener on a container for events from elements that match `selector`,
 * including ones rendered later. Returns a function that removes it.
 */
export function delegate(
  root: HTMLElement,
  type: string,
  selector: string,
  handler: (event: Event, target: HTMLElement) => void,
): () => void {
  const listener = (event: Event) => {
    const start = event.target instanceof Element ? event.target : null;
    const hit = start?.closest<HTMLElement>(selector);
    if (hit && root.contains(hit)) handler(event, hit);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

/** Render a template into an element. */
export function html(el: HTMLElement, markup: string): void {
  el.innerHTML = markup;
}

/** Read or write a value by a dotted path such as "card.radius" or "links.2.label". */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc == null ? acc : (acc as Record<string, unknown>)[key]), obj);
}

export function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop();
  if (last === undefined) return;
  let cur = obj as Record<string, unknown>;
  for (const k of keys) cur = cur[k] as Record<string, unknown>;
  cur[last] = value;
}
