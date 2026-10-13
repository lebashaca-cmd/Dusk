import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

/* Optional Supabase storage. With SUPABASE_URL and SUPABASE_SERVICE_KEY set, the database lives in a Supabase
   table and uploaded files live in a Supabase Storage bucket, so the host needs no persistent disk.
   Without them everything stays in DATA_DIR as before. Plain fetch against the REST API: no extra packages. */

const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_KEY ?? "";
const bucket = process.env.SUPABASE_BUCKET || "dusk";

export const remoteEnabled = Boolean(url && key);

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { apikey: key, ...extra };
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

async function check(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const text = await res.text().catch(() => "");
  throw new Error(`Supabase ${what} failed (${res.status}): ${text.slice(0, 300)}`);
}

/* ---------- the database, kept as one JSON document ---------- */

export async function loadState(): Promise<unknown | null> {
  const res = await check(await fetch(`${url}/rest/v1/dusk_state?id=eq.main&select=data`, { headers: headers() }), "read");
  const rows = (await res.json()) as Array<{ data: unknown }>;
  return rows[0]?.data ?? null;
}

export async function saveState(data: unknown): Promise<void> {
  await check(await fetch(`${url}/rest/v1/dusk_state`, {
    method: "POST",
    headers: headers({ "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ id: "main", data, updated_at: new Date().toISOString() }),
  }), "save");
}

/** Make sure the (private) bucket exists. An existing one is fine. */
export async function ensureBucket(): Promise<void> {
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ id: bucket, name: bucket, public: false }),
  });
  if (res.ok || res.status === 409) return;
  const text = await res.text().catch(() => "");
  if (/already exists/i.test(text)) return;
  throw new Error(`Supabase bucket check failed (${res.status}): ${text.slice(0, 300)}`);
}

/* ---------- uploaded files: the local folder is a cache, the bucket is the truth ---------- */

const MIME: Record<string, string> = { mp3: "audio/mpeg", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const objectUrl = (userId: string, name: string): string => `${url}/storage/v1/object/${bucket}/${encodeURIComponent(userId)}/${encodeURIComponent(name)}`;
const localPath = (userId: string, name: string): string => path.join(config.dataDir, "uploads", userId, name);

/** Copy a file that was just written locally up to the bucket. */
export async function pushFile(userId: string, name: string): Promise<void> {
  if (!remoteEnabled) return;
  const body = await fsp.readFile(localPath(userId, name));
  const type = MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  await check(await fetch(objectUrl(userId, name), { method: "POST", headers: headers({ "content-type": type, "x-upsert": "true" }), body }), "upload");
}

export async function dropFile(userId: string, name: string): Promise<void> {
  if (!remoteEnabled) return;
  const res = await fetch(objectUrl(userId, name), { method: "DELETE", headers: headers() });
  if (!res.ok && res.status !== 404 && res.status !== 400) await check(res, "delete");
}

const inflight = new Map<string, Promise<boolean>>();

/** Make sure a file is on local disk, fetching it from the bucket if the host's disk was wiped. False when it does not exist. */
export function ensureLocal(userId: string, name: string): Promise<boolean> {
  const file = localPath(userId, name);
  if (fs.existsSync(file)) return Promise.resolve(true);
  if (!remoteEnabled) return Promise.resolve(false);
  const running = inflight.get(file);
  if (running) return running;
  const job = (async () => {
    const res = await fetch(objectUrl(userId, name), { headers: headers() });
    if (res.status === 404 || res.status === 400) return false;
    await check(res, "download");
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.part`;
    await fsp.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    await fsp.rename(tmp, file);
    return true;
  })().finally(() => inflight.delete(file));
  inflight.set(file, job);
  return job;
}
