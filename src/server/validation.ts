import { z } from "zod";
import { LIMITS } from "../shared/constants";
import {
  ALIGNS, AVATAR_KINDS, AVATAR_SHAPES, BG_TYPES, BORDER_COLORS, CARD_STYLES, NAME_CASES, ENTRANCES, FONT_KEYS, ICON_NAMES, ICON_COLORS, LINK_HOVERS,
  LINK_LAYOUTS, LYRIC_STYLES, TAG_STYLES, THEME_KEYS,
  type Profile,
} from "../shared/types";
import { safeUrl } from "../shared/url";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colors must look like #aabbcc");
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const num = (min: number, max: number) => z.number().min(min).max(max);
const text = (max: number) => z.string().max(max);

const link = z.object({
  label: text(28),
  url: z.string().max(500).transform(safeUrl),
  note: text(40),
  icon: z.enum(ICON_NAMES),
});

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter a display name").max(32),
  bio: text(LIMITS.bio),
  typewriter: z.boolean(),
  location: text(40),
  showLocation: z.boolean(),
  avatar: z.object({
    kind: z.enum(AVATAR_KINDS),
    emoji: text(8),
    shape: z.enum(AVATAR_SHAPES),
    ring: z.boolean(),
    ringWidth: int(0, 10),
    size: int(70, 150),
  }),
  hiddenRoles: z.array(z.string().max(30)).max(200),
  tagStyle: z.enum(TAG_STYLES),
  links: z.array(link).max(LIMITS.links),
  linkLayout: z.enum(LINK_LAYOUTS),
  iconColor: z.enum(ICON_COLORS),
  linkHover: z.enum(LINK_HOVERS),
  theme: z.enum([...THEME_KEYS, "custom"]),
  colors: z.object({ bg: hex, bg2: hex, text: hex, dim: hex, accent: hex }),
  bgType: z.enum(BG_TYPES),
  gradAngle: int(0, 360),
  gridSize: int(16, 100),
  gridPush: int(0, 100),
  density: num(0.3, 2),
  bgImage: z.string().max(500).transform(safeUrl),
  bgBlur: int(0, 30),
  bgDim: int(0, 80),
  bgSpeed: num(0.2, 3),
  linkGap: int(4, 28),
  nameTracking: int(-6, 8),
  nameCase: z.enum(NAME_CASES),
  bioScale: int(80, 130),
  card: z.object({
    style: z.enum(CARD_STYLES),
    radius: int(0, 48),
    blur: int(0, 40),
    width: int(300, 560),
    align: z.enum(ALIGNS),
    border: z.boolean(),
    borderColor: z.enum(BORDER_COLORS),
    shadow: int(0, 100),
  }),
  font: z.enum(FONT_KEYS),
  nameSize: int(26, 72),
  nameWeight: z.union([z.literal(500), z.literal(600), z.literal(800)]),
  nameGlow: z.boolean(),
  nameGradient: z.boolean(),
  effects: z.object({ tilt: z.boolean(), cursorGlow: z.boolean(), entrance: z.enum(ENTRANCES) }),
  page: z.object({ views: z.boolean(), share: z.boolean(), enter: z.boolean(), enterText: text(24) }),
  music: z.object({
    enabled: z.boolean(),
    autoplay: z.boolean(),
    loop: z.boolean(),
    showProgress: z.boolean(),
    showLyrics: z.boolean(),
    lyricsOpen: z.boolean(),
    lyricsStyle: z.enum(LYRIC_STYLES),
    volume: num(0, 1),
  }),
  discord: z.object({
    enabled: z.boolean(),
    showCard: z.boolean(),
    showActivity: z.boolean(),
    showSpotify: z.boolean(),
    showProgress: z.boolean(),
    showLyrics: z.boolean(),
    lyricsOpen: z.boolean(),
    lyricsStyle: z.enum(LYRIC_STYLES),
  }),
});

/** Compile-time check that the schema and the shared Profile type describe the same shape. */
type Inferred = z.infer<typeof profileSchema>;
const assertSameShape = (p: Inferred): Profile => p;
void assertSameShape;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseProfile(input: unknown): ParseResult<Profile> {
  const result = profileSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  const issue = result.error.issues[0];
  const where = issue && issue.path.length ? issue.path.join(".") + ": " : "";
  return { ok: false, error: where + (issue?.message ?? "Invalid profile") };
}

/** Short free text from a form: trimmed, control characters removed, length capped. */
export function cleanText(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
