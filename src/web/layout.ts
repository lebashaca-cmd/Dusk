/**
 * How the dashboard is arranged: the order of the rail, the free-form board, and which
 * side the live preview sits on.
 *
 * It is kept in the browser, per person, so the editor looks the way you left it. None
 * of this changes the page you publish — the page is the profile, and the profile is
 * the profile. This is only where the tools sit while you are working on it.
 *
 * If this ever grows to want to follow you between machines, `loadLayout` and
 * `saveLayout` are the only two places that need to change.
 */

export interface WidgetBox {
  /** Which widget this is. */
  id: string;
  /** Where it sits on the board, in pixels from the top left. */
  x: number;
  y: number;
  /** How big it is. */
  w: number;
  h: number;
}

export interface Layout {
  /** Pane ids, in the order the rail shows them. */
  nav: string[];
  /** The widgets on the board, and where each one sits. */
  board: WidgetBox[];
  /** Which side of the editor the live preview is on. */
  previewSide: "left" | "right";
}

const key = (user: string): string => `dusk.layout.${user}`;

/** A box is only usable if every number in it is a number. */
const isBox = (v: unknown): v is WidgetBox => {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Partial<WidgetBox>;
  return typeof b.id === "string"
    && Number.isFinite(b.x) && Number.isFinite(b.y)
    && Number.isFinite(b.w) && Number.isFinite(b.h);
};

let current: Layout = { nav: [], board: [], previewSide: "right" };
let owner = "";

/**
 * Read the layout for this person. Anything missing is filled in with the default, so
 * a new widget or a new pane shows up without the saved layout getting in the way.
 */
export function loadLayout(user: string, defaultNav: readonly string[]): Layout {
  owner = user;
  let saved: Partial<Layout> = {};
  try {
    const raw = localStorage.getItem(key(user));
    if (raw) saved = JSON.parse(raw) as Partial<Layout>;
  } catch {
    // No storage, or something unreadable was in there. Start from the defaults.
  }
  const nav = Array.isArray(saved.nav) ? saved.nav.filter(id => defaultNav.includes(id)) : [];
  for (const id of defaultNav) if (!nav.includes(id)) nav.push(id);
  current = {
    nav,
    board: Array.isArray(saved.board) ? saved.board.filter(isBox) : [],
    previewSide: saved.previewSide === "left" ? "left" : "right",
  };
  return current;
}

/** The layout as it is right now. */
export function layout(): Layout {
  return current;
}

/** Keep the layout for next time. */
export function saveLayout(): void {
  try {
    localStorage.setItem(key(owner), JSON.stringify(current));
  } catch {
    // Nowhere to keep it. The layout still works for this visit.
  }
}

/** Put the rail back the way it started. */
export function resetNav(defaultNav: readonly string[]): void {
  current.nav = [...defaultNav];
  saveLayout();
}
