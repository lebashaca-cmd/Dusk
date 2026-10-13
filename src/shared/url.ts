import { RESERVED_USERNAMES, USERNAME_RE } from "./constants";

/**
 * Turn whatever someone typed into a link that is safe to put in an href.
 * Only http and https are allowed; a bare domain gets https:// in front.
 * Returns "" when the value is empty or not usable.
 */
export function safeUrl(input: string): string {
  const x = String(input ?? "").trim();
  if (!x) return "";
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
