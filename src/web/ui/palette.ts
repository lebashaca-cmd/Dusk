import { esc } from "../util/dom";

export interface Command {
  id: string;
  label: string;
  /** A hint on the right, such as the keyboard shortcut or a section name. */
  hint?: string;
  /** The section the command belongs to. */
  group?: string;
  run: () => void;
}

export interface Palette {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

/**
 * The command palette: press ⌘K (or Ctrl+K) and type a few letters to jump anywhere.
 * It is built once and filled in each time it opens, so the commands stay current.
 */
export function mountPalette(commands: () => Command[]): Palette {
  const el = document.createElement("div");
  el.className = "palette";
  el.hidden = true;
  el.innerHTML = `<div class="palette-box" role="dialog" aria-modal="true" aria-label="Command palette">
      <input class="palette-input" type="text" placeholder="Type a command…" aria-label="Type a command" autocomplete="off" spellcheck="false">
      <ul class="palette-list" role="listbox"></ul>
      <p class="palette-foot"><span>↑ ↓ to move</span><span>↵ to run</span><span>esc to close</span></p>
    </div>`;
  document.body.append(el);

  const input = el.querySelector<HTMLInputElement>(".palette-input")!;
  const list = el.querySelector<HTMLUListElement>(".palette-list")!;
  let items: Command[] = [];
  let at = 0;

  const draw = (): void => {
    list.innerHTML = items.map((c, i) => `<li class="palette-item${i === at ? " on" : ""}" role="option" aria-selected="${i === at}" data-i="${i}">
        <span class="pi-label">${esc(c.label)}</span>
        ${c.hint ? `<span class="pi-hint">${esc(c.hint)}</span>` : ""}
      </li>`).join("") || `<li class="palette-empty">Nothing matches that.</li>`;
    const on = list.querySelector<HTMLElement>(".palette-item.on");
    on?.scrollIntoView({ block: "nearest" });
  };

  const filter = (): void => {
    const q = input.value.trim().toLowerCase();
    const all = commands();
    items = q ? all.filter(c => `${c.group ?? ""} ${c.label}`.toLowerCase().includes(q)) : all;
    at = 0;
    draw();
  };

  const close = (): void => {
    el.hidden = true;
    input.value = "";
  };

  const open = (): void => {
    el.hidden = false;
    filter();
    input.focus();
    input.select();
  };

  const run = (c: Command | undefined): void => {
    if (!c) return;
    close();
    c.run();
  };

  input.addEventListener("input", filter);
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); at = Math.min(at + 1, items.length - 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); at = Math.max(at - 1, 0); draw(); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[at]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  list.addEventListener("click", e => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-i]") : null;
    if (!t) return;
    run(items[Number(t.dataset.i)]);
  });
  el.addEventListener("mousedown", e => { if (e.target === el) close(); });

  return { open, close, isOpen: () => !el.hidden };
}
