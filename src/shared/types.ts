/**
 * Types shared by the server and the web app.
 * Anything that crosses the network (profiles, tracks, API responses) is defined here once.
 */

import { BRAND_NAMES } from "./brands";

/** "auto" picks the brand from the link's address. The plain icons are for anything else. */
export const ICON_NAMES = [
  "auto", "link", "globe", "music", "play", "code", "camera", "chat", "mail",
  "star", "heart", "bag", "pen", "gamepad", ...BRAND_NAMES,
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export const PRESENCE_STATUSES = ["online", "idle", "dnd", "offline"] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const BG_TYPES = [
  "solid", "gradient", "aurora", "particles", "grid", "dots", "lines", "spotlight",
  "mesh", "stars", "rain", "grain", "image",
  "waves", "bokeh", "beams", "topo", "glitch",
] as const;
export type BgType = (typeof BG_TYPES)[number];

export const CARD_STYLES = ["glass", "solid", "outline", "none"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const BORDER_COLORS = ["text", "accent"] as const;
export type BorderColor = (typeof BORDER_COLORS)[number];

export const NAME_CASES = ["normal", "upper", "lower"] as const;
export type NameCase = (typeof NAME_CASES)[number];

export const ALIGNS = ["center", "left"] as const;
export type Align = (typeof ALIGNS)[number];

/** Which color link icons use: the page text, the accent, or each brand's own color (adjusted to stay readable). */
export const ICON_COLORS = ["theme", "accent", "brand"] as const;
export type IconColor = (typeof ICON_COLORS)[number];

export const LINK_HOVERS = ["lift", "glow", "none"] as const;
export type LinkHover = (typeof LINK_HOVERS)[number];

export const LINK_LAYOUTS = ["rows", "pills", "icons", "grid"] as const;
export type LinkLayout = (typeof LINK_LAYOUTS)[number];

export const TAG_STYLES = ["pill", "solid", "outline", "minimal"] as const;
export type TagStyle = (typeof TAG_STYLES)[number];

export const AVATAR_KINDS = ["letter", "emoji", "image", "discord"] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];

export const AVATAR_SHAPES = ["circle", "rounded", "square"] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

export const FONT_KEYS = ["inter", "dm", "syne", "mono", "serif", "bebas", "space", "outfit", "caveat"] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export const ENTRANCES = ["rise", "fade", "zoom", "blur", "slide", "none"] as const;
export type Entrance = (typeof ENTRANCES)[number];

export const LYRIC_STYLES = ["panel", "island"] as const;
export type LyricStyle = (typeof LYRIC_STYLES)[number];

/** How the public page is put together: the usual column, or the free-form board. */
export const PAGE_LAYOUTS = ["regular", "experimental"] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];

/** Where the lyrics come from. */
export const LYRIC_PROVIDERS = ["lrclib", "polaris", "polarisMono", "genius"] as const;
export type LyricProvider = (typeof LYRIC_PROVIDERS)[number];

/** Backgrounds only VIP members can pick. */
export const VIP_BG_TYPES: readonly BgType[] = ["mesh", "stars", "rain", "grain", "image", "glitch"];

export const THEME_KEYS = [
  "dusk", "midnight", "frost", "neon", "sunset", "ocean", "forest", "rose", "slate", "ember", "lilac", "moss",
] as const;
export type ThemeName = (typeof THEME_KEYS)[number];
export type ThemeKey = ThemeName | "custom";

/* ---------- profile ---------- */

export interface LinkItem {
  /** A stable id, so clicks can be counted per link even if the order changes. */
  id: string;
  label: string;
  url: string;
  note: string;
  icon: IconName;
  /** The id of the group this link sits under, if any. */
  group?: string;
}

/** A heading that a set of links sits under, like "Work" or "Elsewhere". */
export interface LinkGroup {
  id: string;
  label: string;
}

/** A role from the Discord server, shown on the page as a tag. */
export interface RoleTag {
  id: string;
  name: string;
  /** #rrggbb */
  color: string;
}

export interface ProfileColors {
  bg: string;
  bg2: string;
  text: string;
  dim: string;
  accent: string;
}

export interface AvatarSettings {
  kind: AvatarKind;
  emoji: string;
  shape: AvatarShape;
  ring: boolean;
  /** Thickness of the ring in px. */
  ringWidth: number;
  size: number;
}

export interface CardSettings {
  style: CardStyle;
  radius: number;
  blur: number;
  width: number;
  align: Align;
  border: boolean;
  borderColor: BorderColor;
  /** How strong the drop shadow is, 0 to 100. */
  shadow: number;
}

export interface EffectSettings {
  tilt: boolean;
  cursorGlow: boolean;
  entrance: Entrance;
}

/** How a piece is lined up inside its own box. */
export type BoxAlign = "center" | "left";

/** How a piece is filled in. */
export type BoxFill = "soft" | "solid" | "outline" | "glass" | "none";

/** How the content of a piece is fitted into it. */
export type BoxFit = "scale" | "fixed";

/** One piece of the page, and where it sits on the free-form board. */
export interface BoardBox {
  /** Which piece this is, e.g. "profile" or "links". */
  id: string;
  /** Where it sits, in pixels from the top left of the board. */
  x: number;
  y: number;
  /** How big it is. */
  w: number;
  h: number;
  /** How the piece is lined up inside its box. */
  align?: BoxAlign;
  /** How the piece is filled in. */
  fill?: BoxFill;
  /** Old setting from when content was scaled to fit. Kept so saved boards still load; it does nothing now. */
  fit?: BoxFit;
  /** When true the piece is exactly `h` tall. Otherwise it is as tall as what is inside it. */
  fixedH?: boolean;
  /** The room inside the piece, in pixels. */
  pad?: number;
  /** The roundness of the piece's corners, in pixels. */
  radius?: number;
  /** How see-through the piece is, 20 to 100. */
  opacity?: number;
  /** How much the page behind the piece is blurred, in pixels. */
  blur?: number;
  /** The width of the piece's border, in pixels. */
  borderW?: number;
  /** How strong the shadow under the piece is, 0 to 100. */
  shadow?: number;
  /** Which piece is in front: a higher layer is drawn over a lower one. */
  z?: number;
  /** The words on a page's title or on a button. */
  label?: string;
  /** For a button: the id of the page it scrolls to, or "top". */
  target?: string;
}

export interface PageSettings {
  views: boolean;
  share: boolean;
  enter: boolean;
  enterText: string;
  /** Regular is the usual column. Experimental is the free-form board. */
  layout: PageLayout;
  /** Where the pieces sit on the free-form board. */
  board: BoardBox[];
  /** Which service the lyrics are looked up in. */
  lyricsProvider: LyricProvider;
}

export interface MusicSettings {
  enabled: boolean;
  autoplay: boolean;
  loop: boolean;
  showProgress: boolean;
  showLyrics: boolean;
  lyricsOpen: boolean;
  lyricsStyle: LyricStyle;
  /** 0 to 1 */
  volume: number;
}

export interface DiscordSettings {
  /** Show live Discord presence. Publishes the owner's Discord user ID in the public page data. */
  enabled: boolean;
  showCard: boolean;
  showActivity: boolean;
  showSpotify: boolean;
  showProgress: boolean;
  showLyrics: boolean;
  lyricsOpen: boolean;
  lyricsStyle: LyricStyle;
  /** Color the avatar's status dot from live Discord status. */
}

export interface Profile {
  name: string;
  bio: string;
  typewriter: boolean;
  location: string;
  showLocation: boolean;
  /** Manual status dot, used when Discord status is not synced. */
  avatar: AvatarSettings;
  /** Ids of Discord roles the owner chose not to show. */
  hiddenRoles: string[];
  tagStyle: TagStyle;
  links: LinkItem[];
  /** Headings that group the links. Links without a group come first. */
  groups: LinkGroup[];
  linkLayout: LinkLayout;
  iconColor: IconColor;
  linkHover: LinkHover;
  theme: ThemeKey;
  colors: ProfileColors;
  bgType: BgType;
  gradAngle: number;
  /** Grid background: size of one square in px, and how hard the cursor pushes it (0 to 100). */
  gridSize: number;
  gridPush: number;
  /** Particle background amount, 0.3 (few) to 2 (many). */
  density: number;
  /** Picture background (VIP): the image address, and how much it is blurred in px. */
  bgImage: string;
  bgBlur: number;
  /** Darken any background, 0 to 80 percent. */
  bgDim: number;
  /** How fast animated backgrounds move, 0.2 to 3 times. */
  bgSpeed: number;
  /** Space between links in px. */
  linkGap: number;
  /** Letter spacing of the name in hundredths of an em, -6 to 8. */
  nameTracking: number;
  nameCase: NameCase;
  /** Bio text size, 80 to 130 percent. */
  bioScale: number;
  card: CardSettings;
  font: FontKey;
  nameSize: number;
  nameWeight: 500 | 600 | 800;
  nameGlow: boolean;
  nameGradient: boolean;
  effects: EffectSettings;
  page: PageSettings;
  music: MusicSettings;
  discord: DiscordSettings;
}

/* ---------- music ---------- */

export interface LyricLine {
  /** Seconds from the start of the song. */
  t: number;
  text: string;
}

export type LyricsStatus = "synced" | "plain" | "none" | "instrumental";

export interface Lyrics {
  status: LyricsStatus;
  lines: LyricLine[];
  plain: string;
  /** Which service these lyrics came from. */
  source?: LyricProvider;
}

export type CoverSource = "embedded" | "itunes" | "upload" | "none";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Seconds. */
  duration: number;
  audioUrl: string;
  coverUrl: string | null;
  coverSource: CoverSource;
  lyrics: Lyrics;
  /** False when the song's file is not on the server, so it cannot be played. */
  available: boolean;
}

/* ---------- API payloads ---------- */

export interface UserInfo {
  /** The ID of this page. For a first page it is the Discord user ID. */
  id: string;
  username: string;
  discordName: string;
  discordAvatarUrl: string | null;
}

export interface PageInfo {
  id: string;
  username: string;
  active: boolean;
}

export interface MeResponse {
  user: UserInfo;
  /** The Discord account that owns this page. Differs from user.id on extra pages. */
  ownerId: string;
  /** Every page this account has, and whether it may create more (owners and devs). */
  pages: PageInfo[];
  canMultiPage: boolean;
  maxPages: number;
  profile: Profile;
  tracks: Track[];
  avatarUrl: string | null;
  views: number;
  /** Every role the person has in the Discord server. */
  roles: RoleTag[];
  /** Whether this site is tied to a Discord server (so roles and joining apply). */
  guildEnabled: boolean;
  /** False for an account made with an email: it has no Discord status or Discord roles. */
  discord: boolean;
  /** VIP members can use the Dynamic Island, the premium backgrounds and picture backgrounds. */
  vip: boolean;
  /** Which lyrics services this server can use, and whether each one is set up. */
  lyricsProviders: LyricProviderInfo[];
}

/** One lyrics service, and whether this server has it working. */
export interface LyricProviderInfo {
  id: LyricProvider;
  name: string;
  /** True when the service can answer right now. */
  ready: boolean;
  /** What is missing, when it is not ready. */
  note: string;
}

/** Everything needed to draw a profile. Used for public pages and for the owner's own preview. */
export interface RenderModel {
  username: string;
  profile: Profile;
  avatarUrl: string | null;
  discordAvatarUrl: string | null;
  /** Only set when the owner turned on live Discord status. */
  discordId: string | null;
  tracks: Track[];
  views: number;
  /** The roles that are shown as tags. */
  roles: RoleTag[];
}

export interface SiteConfig {
  /** Everyone has to be in this Discord server to log in. */
  guildRequired: boolean;
  inviteUrl: string | null;
  /** Where "Risk" in the footer credit links. */
  creditUrl: string | null;
}

export type PublicProfile = RenderModel;

export interface SiteStats {
  /** Accounts. */
  users: number;
  /** Pages with something on them: a bio, a link or a song. */
  pages: number;
  /** People with the site open right now. */
  online: number;
}

export interface UsernameCheck {
  available: boolean;
  /** Why it is not available, in words a person can act on. */
  reason: string;
}

/** How the page has been doing. Shown in the dashboard. */
export interface Insights {
  /** Views in total, all time. */
  views: number;
  /** Views per day for the last 30 days, oldest first. */
  days: { day: string; count: number }[];
  /** How many times each link was opened, most used first. */
  clicks: { id: string; label: string; count: number }[];
  /** Opens of any link, all time. */
  clicksTotal: number;
}

export interface ApiErrorBody {
  error: string;
}

/* ---------- community ---------- */

export interface CommunityProfile {
  username: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  discordAvatarUrl: string | null;
  colors: ProfileColors;
  bgType: BgType;
  views: number;
}

export interface CommunityTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  colors: ProfileColors;
  bgType: BgType;
  font: FontKey;
  uses: number;
  createdAt: number;
  /** True for the logged-in person's own templates, which they can delete. */
  mine: boolean;
}

export interface CommunityMe {
  listed: boolean;
  /** True when the open page has something to show (a name is always there, so this is about the bio). */
  hasBio: boolean;
}
