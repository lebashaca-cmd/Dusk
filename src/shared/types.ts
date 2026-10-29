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

/** The picture a link preview shows: the card made for the page, the profile picture, the background picture, or none. */
export const EMBED_IMAGES = ["card", "avatar", "background", "none"] as const;
export type EmbedImage = (typeof EMBED_IMAGES)[number];

/** The kinds of piece that can stand on the picture of a link preview. */
export const EMBED_KINDS = ["text", "links", "avatar", "image", "shape", "logo"] as const;
export type EmbedKind = (typeof EMBED_KINDS)[number];

/** One piece on the picture of a link preview. Its box is in the picture's own 1200 by 630 pixels. */
export interface EmbedBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Set by the move engine, which is shared with the page board. Not used for drawing. */
  anc?: "l" | "c" | "r" | "s";
  fixedH?: boolean;
  /** Kept where it is. */
  locked?: boolean;
  ratio?: boolean;
  /** The words of a text piece. {name}, {username}, {bio}, {views}, {links} and {tag} are filled in. */
  text?: string;
  /** Text size in pixels, weight, colour (empty is the page's text colour), alignment. */
  size?: number;
  wt?: 400 | 500 | 600 | 700 | 800;
  color?: string;
  align?: "left" | "center" | "right";
  /** How solid the whole piece is, 10 to 100. */
  op?: number;
  /** A shape's or a pill's fill colour and how solid it is, its outline, and how round its corners are. */
  fill?: string;
  fillOp?: number;
  stroke?: string;
  strokeW?: number;
  radius?: number;
  /** For a picture: whose picture it is, where an uploaded one lives, how it fills the box and what shape it is cut to. */
  src?: "avatar" | "background" | "media";
  url?: string;
  fit?: "cover" | "contain";
  shape?: "circle" | "round" | "square";
  /** For the links piece: how many links at most. */
  count?: number;
}

export interface EmbedBackground {
  mode: "page" | "solid" | "gradient" | "image";
  c1: string;
  c2: string;
  angle: number;
  /** The soft light of the accent colour in the corner. */
  glow: boolean;
  src: "background" | "media";
  url: string;
  /** How much the picture is darkened, 0 to 90. */
  dim: number;
  /** A video that plays behind the pieces where it can (on the enter screen; in a link preview in apps that play one). Empty for none. */
  video: string;
}

/** The pieces and background of the picture a link preview shows. */
export interface EmbedDesign {
  bg: EmbedBackground;
  boxes: EmbedBox[];
}

/** How a link to the page looks when it is posted in Discord and other apps. Empty text means the default. */
export interface EmbedSettings {
  title: string;
  desc: string;
  site: string;
  /** The colour of the bar beside the preview, or empty for the page's accent colour. */
  color: string;
  image: EmbedImage;
  /** A big picture under the text, or a small one beside it. */
  large: boolean;
  /** The pieces of the picture, when the owner arranged them. Null is the standard picture, which follows every update. */
  design: EmbedDesign | null;
}

/** What the mouse looks like and does on the page. */
export const CURSOR_STYLES = ["default", "dot", "ring", "arrow", "crosshair", "heart", "star", "sparkle", "custom"] as const;
export type CursorStyle = (typeof CURSOR_STYLES)[number];
export const TRAIL_STYLES = ["none", "dots", "glow", "sparkles", "stars", "hearts", "ribbon", "comet"] as const;
export type TrailStyle = (typeof TRAIL_STYLES)[number];
export const CLICK_SOUNDS = ["none", "pop", "click", "tick", "chime", "bubble", "thud", "custom"] as const;
export type ClickSound = (typeof CLICK_SOUNDS)[number];

export interface MouseSettings {
  cursor: CursorStyle;
  /** The cursor's colour, or empty for the accent colour. */
  cursorColor: string;
  cursorSize: number;
  /** A picture of the person's own, for the "custom" cursor. */
  cursorImage: string;
  trail: TrailStyle;
  /** The trail's colour, or empty for the accent colour. */
  trailColor: string;
  trailRainbow: boolean;
  /** How long a piece of the trail lasts, in tenths of a second, and how big it is. */
  trailLife: number;
  trailSize: number;
  click: ClickSound;
  clickVolume: number;
  /** An address of a sound, for the "custom" click. */
  clickUrl: string;
  /** Whether the sound plays anywhere on the page or only on links and buttons. */
  clickLinks: boolean;
}

export const ENTRANCES = ["rise", "fade", "zoom", "blur", "slide", "none"] as const;
export type Entrance = (typeof ENTRANCES)[number];

export const LYRIC_STYLES = ["panel", "island"] as const;
export type LyricStyle = (typeof LYRIC_STYLES)[number];

/** How the public page is put together: the usual column, or the free-form board. */
export const PAGE_LAYOUTS = ["regular", "experimental"] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];

/** Where the lyrics come from. */
export const LYRIC_PROVIDERS = ["lrclib", "genius", "musixmatch", "petit"] as const;
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

/** One entry of a games or music list: a name, a small line under it (a rating or an artist) and a cover. */
export interface ListEntry {
  n: string;
  s?: string;
  c?: string;
}

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
  /** On a screen wider than the board: which side the piece holds on to. l, c and r keep its size and stay left, middle or right. s keeps its left side and stretches to the right edge. */
  anc?: "l" | "c" | "r" | "s";
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
  /** The words of a text piece. */
  text?: string;
  /** The address of a picture, for an image piece. */
  url?: string;
  /** For a scroll rail: where it sits. "here" is on the board; the others stay on the screen as you scroll. */
  dock?: "here" | "left" | "right";
  /** How a rail marks a page ("bar" or "dot"), or how an image fills its piece ("cover" or "contain"). */
  look?: "bar" | "dot" | "cover" | "contain";
  /** How thick a rail or a divider is, in pixels. */
  size?: number;
  /** The colour of a piece's writing, rail or divider, like #aabbcc. */
  color?: string;
  /** For an item: a link (a button that opens an address) or plain text. */
  mode?: "link" | "text";
  /** For an item: the id of the group it sits in. An item in a group has no place of its own on the board. */
  into?: string;
  /** For a group: how its items are laid out. */
  flow?: "col" | "row" | "grid";
  /** For a group: the space between its items, in pixels. */
  gap?: number;
  /** For an item: the little picture beside its words ("auto" picks one from the address, "none" shows no picture). */
  icon?: string;
  /** Where the content sits in a piece that is taller than it. */
  valign?: "top" | "middle" | "bottom";
  /** A background colour of its own, and how solid it is (0 to 100). */
  bg?: string;
  bga?: number;
  /** The border's line style and colour. */
  bstyle?: "solid" | "dashed" | "dotted" | "double";
  bc?: string;
  /** A glow around the piece, 0 to 100. */
  glow?: number;
  /** A tilt, in degrees. */
  rot?: number;
  /** How big everything inside is drawn, as a percentage. */
  zoom?: number;
  /** What happens when the pointer is over it. */
  hover?: "none" | "lift" | "grow" | "shrink" | "tilt" | "spin" | "glow" | "bright";
  /** How it arrives. */
  anim?: "none" | "fade" | "rise" | "drop" | "zoom" | "pop" | "left" | "right" | "flip" | "blur" | "spin" | "slide";
  /** How long the arrival takes, in milliseconds. */
  animMs?: number;
  /** How long to wait before it arrives, in milliseconds. */
  animDelay?: number;
  /** Whether it arrives when the page opens, or when the visitor scrolls to it. */
  animOn?: "load" | "view";
  /** A movement it keeps doing. */
  loop?: "none" | "float" | "pulse" | "breathe" | "sway" | "bounce" | "spin" | "wobble" | "swing";
  /** How long one round of the movement takes, in milliseconds. */
  loopMs?: number;
  /** How it drifts against the scroll, as a percentage of how far the page scrolled. Negative goes the other way. */
  par?: number;
  /** Old setting: floats gently up and down. It is the same as the float movement. */
  float?: boolean;
  /** Kept where it is: it cannot be moved or resized on the board until it is unlocked. */
  locked?: boolean;
  /** Pulling a corner keeps the shape of the piece. */
  ratio?: boolean;
  /** The profile piece: the words shown as the name instead of the profile's, its size, weight, colour, spacing, case and style. */
  ntext?: string;
  nsz?: number;
  nwt?: 400 | 500 | 600 | 700 | 800;
  ncol?: string;
  ntr?: number;
  ncase?: "normal" | "upper" | "lower";
  nfx?: "plain" | "glow" | "gradient";
  /** The profile piece: what is shown under the name. */
  handle?: "site" | "discord" | "none";
  /** The profile piece: show the Discord banner, how tall it is, and whether the picture is left out. */
  banner?: boolean;
  /** The profile piece: show my Discord server tag next to the name. */
  stag?: boolean;
  bnh?: number;
  noav?: boolean;
  /** The profile piece: how big the picture is, in pixels. */
  avs?: number;
  /** A colour theme for the piece (one of the named ones, or "custom" with two colours of its own), and how strong it is. */
  theme?: string;
  tc1?: string;
  tc2?: string;
  tha?: number;
  /** An effect that plays over the piece, and how much of it there is. */
  fx?: "none" | "sparkles" | "snow" | "embers" | "rain" | "bubbles" | "stars" | "confetti";
  fxn?: number;
  /** For a games or music list: the entries, and how the cards look. */
  items?: ListEntry[];
  cardW?: number;
  dots?: boolean;
  /** How the cards move when the list slides: scroll-linked depth, a plain slide, or nothing. */
  lmo?: "flow" | "slide" | "none";
  /** Left out when the pieces are stacked on a phone. */
  hideMobile?: boolean;
}

export interface PageSettings {
  views: boolean;
  share: boolean;
  enter: boolean;
  enterText: string;
  /** The enter screen arranged by hand. Null is the plain one with just the words. */
  gate: EmbedDesign | null;
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
  mouse: MouseSettings;
  page: PageSettings;
  embed: EmbedSettings;
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

/** A Discord server tag: the letters, and the server's badge picture when it has one. */
export interface ServerTag {
  tag: string;
  badgeUrl: string | null;
}

export interface UserInfo {
  /** The ID of this page. For a first page it is the Discord user ID. */
  id: string;
  username: string;
  discordName: string;
  discordAvatarUrl: string | null;
  /** The Discord username, and the banner when the account has one. Only the owner gets these here. */
  discordTag: string | null;
  discordBannerUrl: string | null;
  discordAccent: string | null;
  /** The Discord server tag of this account, when it shows one. */
  serverTag: ServerTag | null;
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
  /** The Discord username and banner. Only set when the profile piece is set to show them. */
  discordTag?: string | null;
  discordBannerUrl?: string | null;
  discordAccent?: string | null;
  /** The Discord server tag. Only set when the profile piece is set to show it. */
  serverTag?: ServerTag | null;
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
