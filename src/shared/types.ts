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

export const BG_TYPES = ["solid", "gradient", "aurora", "particles", "grid"] as const;
export type BgType = (typeof BG_TYPES)[number];

export const CARD_STYLES = ["glass", "solid", "outline", "none"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

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

export const FONT_KEYS = ["inter", "dm", "syne", "mono", "serif", "bebas"] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export const ENTRANCES = ["rise", "fade", "zoom", "none"] as const;
export type Entrance = (typeof ENTRANCES)[number];

export const LYRIC_STYLES = ["panel", "island"] as const;
export type LyricStyle = (typeof LYRIC_STYLES)[number];

export const THEME_KEYS = ["midnight", "frost", "neon", "sunset", "ocean", "forest", "rose", "slate"] as const;
export type ThemeName = (typeof THEME_KEYS)[number];
export type ThemeKey = ThemeName | "custom";

/* ---------- profile ---------- */

export interface LinkItem {
  label: string;
  url: string;
  note: string;
  icon: IconName;
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
  size: number;
}

export interface CardSettings {
  style: CardStyle;
  radius: number;
  blur: number;
  width: number;
  align: Align;
  border: boolean;
}

export interface EffectSettings {
  tilt: boolean;
  cursorGlow: boolean;
  entrance: Entrance;
}

export interface PageSettings {
  views: boolean;
  share: boolean;
  enter: boolean;
  enterText: string;
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
