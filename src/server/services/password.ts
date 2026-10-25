import crypto from "node:crypto";

/** Passwords are stored as a salted scrypt hash, never as the password itself. */
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** "scrypt$salt$hash", both parts in base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** A hash to compare against when there is no account, so a wrong name and a wrong password take the same time. */
const DECOY = hashPassword(crypto.randomBytes(12).toString("hex"));

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const parts = (stored ?? (await DECOY)).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64");
  const want = Buffer.from(parts[2]!, "base64");
  const got = await scrypt(password, salt);
  return want.length === got.length && crypto.timingSafeEqual(want, got) && stored !== undefined;
}
