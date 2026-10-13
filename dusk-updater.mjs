#!/usr/bin/env node
// dusk-updater: drop a new dusk .zip on a web page and it replaces the files in your project folder.
// No install needed. Run it from your project folder:   node dusk-updater.mjs
// Then open http://localhost:4000

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const PORT = Number(process.env.UPDATER_PORT || 4000);
const MAX_ZIP = 300 * 1024 * 1024;
// Never touched, never deleted, never overwritten: your secrets, your data, your installs.
const KEEP = new Set([".env", ".env.local", "data", "node_modules", "dist", ".git", ".dusk-backup", "dusk-updater.mjs"]);

// ---------- minimal zip reader (stored + deflate) ----------
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That does not look like a zip file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Zip is damaged.");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? "utf8" : "latin1", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const lh = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(lh, lh + csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`Unsupported zip compression (${method}) for ${name}.`);
    out.push({ name, data });
  }
  return out;
}

// ---------- helpers ----------
function clean(name) {
  const parts = name.replace(/\\/g, "/").split("/").filter(p => p && p !== ".");
  if (parts.some(p => p === "..")) throw new Error(`Unsafe path in zip: ${name}`);
  return parts;
}

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (dir === base && KEEP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, acc);
    else if (e.isFile()) acc.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return acc;
}

function emptyDirs(dir, base) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || (dir === base && KEEP.has(e.name))) continue;
    const full = path.join(dir, e.name);
    emptyDirs(full, base);
    if (!fs.readdirSync(full).length) fs.rmdirSync(full);
  }
}

function apply(target, zipBuf, prune) {
  const root = path.resolve(target);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("That folder does not exist.");
  let files = readZip(zipBuf).map(f => ({ parts: clean(f.name), data: f.data }));
  if (!files.length) throw new Error("The zip is empty.");
  // If everything sits inside one top folder (like dusk/), strip it.
  const top = files[0].parts[0];
  if (files.every(f => f.parts.length > 1 && f.parts[0] === top)) files = files.map(f => ({ ...f, parts: f.parts.slice(1) }));
  files = files.filter(f => !KEEP.has(f.parts[0]));
  if (!files.some(f => f.parts.join("/") === "package.json")) throw new Error("No package.json in the zip. Is this a dusk zip?");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(root, ".dusk-backup", stamp);
  const save = rel => {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) return;
    const dst = path.join(backup, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  };

  const incoming = new Set();
  let added = 0, changed = 0, same = 0, removed = 0;
  for (const f of files) {
    const rel = f.parts.join("/");
    incoming.add(rel);
    const dst = path.join(root, ...f.parts);
    if (fs.existsSync(dst)) {
      if (fs.readFileSync(dst).equals(f.data)) { same++; continue; }
      save(rel); changed++;
    } else added++;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, f.data);
  }
  if (prune) {
    for (const rel of walk(root)) {
      if (incoming.has(rel)) continue;
      save(rel);
      fs.unlinkSync(path.join(root, rel));
      removed++;
    }
    emptyDirs(root, root);
  }
  const needsInstall = files.some(f => f.parts.join("/") === "package.json") && changed + added > 0;
  return { added, changed, same, removed, backup: changed + removed ? path.relative(root, backup) : null, needsInstall, root };
}

// ---------- tiny web page ----------
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dusk updater</title>
<style>
:root{--bg:#000;--fg:#fff;--dim:#8a8a8a;--line:rgba(255,255,255,.14)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,system-ui,sans-serif}
main{width:100%;max-width:520px;border:1px solid var(--line);background:rgba(255,255,255,.03);border-radius:32px;padding:30px}
h1{margin:0 0 4px;font-size:2rem;letter-spacing:-.04em;font-weight:800}p{margin:0 0 16px;color:var(--dim)}
label{display:block;font-size:13px;color:var(--dim);margin:14px 0 6px}
input[type=text]{width:100%;padding:12px 16px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--fg);font:inherit}
.drop{margin-top:16px;border:1px dashed var(--line);border-radius:24px;padding:34px 16px;text-align:center;color:var(--dim);cursor:pointer;transition:.2s}
.drop.on,.drop:hover{border-color:#fff;color:#fff;background:rgba(255,255,255,.05)}
.chk{display:flex;gap:10px;align-items:flex-start;margin-top:14px;color:var(--dim);font-size:13px}
button{margin-top:18px;width:100%;padding:13px;border:0;border-radius:999px;background:#fff;color:#000;font:600 15px inherit;cursor:pointer}
button:disabled{opacity:.4;cursor:default}
.out{margin-top:16px;padding:14px 16px;border-radius:20px;border:1px solid var(--line);font-size:14px;white-space:pre-wrap;display:none}
.out.err{border-color:#ff6b6b;color:#ff9b9b}
</style></head><body><main>
<h1>dusk updater</h1><p>Drop the new zip. Your old files get replaced. Your .env, data and node_modules are never touched.</p>
<label for="t">Project folder</label><input id="t" type="text" spellcheck="false">
<div class="drop" id="d">Drop the zip here, or click to choose</div><input id="f" type="file" accept=".zip" hidden>
<label class="chk"><input type="checkbox" id="p" checked><span>Also remove files that are not in the new zip (old versions are saved in .dusk-backup first)</span></label>
<button id="b" disabled>Update</button><div class="out" id="o"></div>
</main><script>
const $=s=>document.querySelector(s);let file=null;
fetch('/info').then(r=>r.json()).then(i=>{$('#t').value=i.target});
const d=$('#d'),f=$('#f');
const pick=x=>{if(!x)return;file=x;d.textContent=x.name+'  ('+(x.size/1024/1024).toFixed(1)+' MB)';$('#b').disabled=false};
d.onclick=()=>f.click();f.onchange=()=>pick(f.files[0]);
d.ondragover=e=>{e.preventDefault();d.classList.add('on')};d.ondragleave=()=>d.classList.remove('on');
d.ondrop=e=>{e.preventDefault();d.classList.remove('on');pick(e.dataTransfer.files[0])};
$('#b').onclick=async()=>{
  const o=$('#o');o.style.display='block';o.className='out';o.textContent='Updating...';$('#b').disabled=true;
  try{
    const r=await fetch('/apply?target='+encodeURIComponent($('#t').value)+'&prune='+($('#p').checked?1:0),{method:'POST',body:file});
    const j=await r.json();if(!r.ok)throw new Error(j.error||'Failed');
    o.textContent='Done.\\n'+j.added+' added, '+j.changed+' replaced, '+j.removed+' removed, '+j.same+' unchanged.'+
      (j.backup?'\\nOld files saved in '+j.backup:'')+
      '\\n\\nNext: '+(j.needsInstall?'in your terminal run  npm install  (if it asks for it), then ':'')+'restart  npm run dev';
  }catch(e){o.className='out err';o.textContent=e.message}
  $('#b').disabled=false;
};
</script></body></html>`;

// ---------- server ----------
const state = { target: process.cwd() };
const send = (res, code, body, type = "application/json") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(type === "application/json" ? JSON.stringify(body) : body); };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/") return send(res, 200, PAGE, "text/html; charset=utf-8");
  if (req.method === "GET" && url.pathname === "/info") return send(res, 200, { target: state.target });
  if (req.method === "POST" && url.pathname === "/apply") {
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > MAX_ZIP) { req.destroy(); } else chunks.push(c); });
    req.on("end", () => {
      try {
        const target = url.searchParams.get("target") || state.target;
        const r = apply(target, Buffer.concat(chunks), url.searchParams.get("prune") === "1");
        state.target = r.root;
        send(res, 200, r);
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }
  send(res, 404, { error: "Not found" });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`dusk updater running. Open http://localhost:${PORT}`);
  console.log(`Project folder: ${state.target}`);
});
