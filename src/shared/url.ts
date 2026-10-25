import { RESERVED_USERNAMES, USERNAME_RE } from "./constants";

/**
 * Turn whatever someone typed into a link that is safe to put in an href.
 * Only http and https are allowed; a bare domain gets https:// in front.
 * Returns "" when the value is empty or not usable.
 */
export function safeUrl(input: string): string {
  const x = String(input ?? "").trim();
  if (!x) return "";
  // A file uploaded to this site.
  if (isOwnMedia(x)) return x;
  if (/^[a-z][a-z0-9+.-]*:/i.test(x)) return /^https?:\/\//i.test(x) ? x : "";
  if (/\s/.test(x)) return "";
  return "https://" + x;
}

/** Lowercase and strip everything a username may not contain. */
export function cleanUsername(input: string): string {
  return String(input ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 20);
}

export type UsernameProblem = "format" | "reserved" | null;

export function checkUsernameFormat(name: string): UsernameProblem {
  if (!USERNAME_RE.test(name)) return "format";
  if (RESERVED_USERNAMES.includes(name)) return "reserved";
  return null;
}

export const USERNAME_HELP = "Use 3 to 20 letters, numbers, dots, dashes or underscores.";

/** The address of a file somebody uploaded here: /media/file/<owner>/<name>. */
export const OWN_MEDIA = /^\/media\/file\/[A-Za-z0-9_-]{1,40}\/m-[a-f0-9]{16}\.(jpg|png|webp|gif|mp4|webm|ogg)$/;
export const isOwnMedia = (u: string): boolean => OWN_MEDIA.test(u);

/** Whether an address is a video file, judged by its ending. */
export const isVideoUrl = (u: string): boolean => /\.(mp4|webm|ogv|ogg|mov|m4v)(\?[^#]*)?(#.*)?$/i.test(u);
