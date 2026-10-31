/** What changed on dusk, newest first. Each entry is one update; each line is something that changed for the people using the site. */
export interface ChangelogEntry {
  /** The day, as YYYY-MM-DD. */
  date: string;
  title: string;
  added?: string[];
  improved?: string[];
  fixed?: string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-10-31",
    title: "Changelog",
    added: ["This page, so you can see what changed on dusk and when."],
  },
  {
    date: "2026-10-29",
    title: "Enter screen designer and embed video",
    added: [
      "Enter screen tab (under Look): arrange the screen people tap before your page opens. Drag, size and add text, pictures, shapes and your profile picture, set its background, and put a video behind it.",
      "Video behind your embed picture. Apps that can play a video, such as Discord, show it when your link is posted; others show the still picture.",
      "“Copy a fresh link” in the Embed tab. Posting it makes Discord read your page again, so it shows your latest embed.",
    ],
    improved: ["Your page is no longer cached by other apps, so changes to your embed show up sooner."],
  },
  {
    date: "2026-10-28",
    title: "Mouse effects and the embed designer",
    added: [
      "Mouse options in Style: your own cursor (dot, ring, arrow, crosshair, heart, star, sparkle or your own picture), a trail behind it (dots, glow, sparkles, stars, hearts, ribbon or comet), and a click sound (pop, click, tick, chime, bubble, thud or your own).",
      "Embed designer: arrange the picture of your link like the page board. Drag, size and add text, links, pictures, shapes and your mark, and change the background.",
      "Your Discord server tag can show next to your name on the page.",
      "Lyrics and list slides now animate.",
    ],
    improved: [
      "Sharing a look to the Community now copies your page's layout and objects, and your embed design and mouse settings, without what you wrote or uploaded.",
      "The standard embed picture follows every update of dusk, and its address changes with each update so apps fetch it again.",
    ],
    fixed: [
      "The line-by-line bio typing now works. Effects you switch on are no longer turned off by your device's reduced-motion setting.",
      "Lists no longer snap back when they slide.",
    ],
  },
];
