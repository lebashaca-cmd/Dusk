import type { MouseSettings } from "../../shared/types";

/**
 * What the mouse does on a page: its own cursor, a trail that follows it, and a sound when it clicks.
 * Everything lives inside the stage element, so in the editor's preview it never leaks onto the editor itself.
 * These are things the owner switched on, so the device's "reduce motion" setting is not consulted (the same as
 * the other effects they choose). A touch screen has no cursor and no trail; a tap can still make its sound.
 */

const INTERACTIVE = "a, button, [role=button], input, select, textarea, label, [data-click]";

/* ---------- sound ---------- */

let audio: AudioContext | null = null;
function context(): AudioContext | null {
  if (audio) return audio;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try { audio = new Ctor(); } catch { audio = null; }
  return audio;
}

/** A short tone that starts at `f0`, slides to `f1` and fades out. */
function tone(ac: AudioContext, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0): void {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A burst of noise, for a click. */
function burst(ac: AudioContext, dur: number, gain: number, freq: number): void {
  const n = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(hp).connect(g).connect(ac.destination);
  src.start();
}

/** Play the click sound the settings ask for. Used by the page and by the "play it" button in the editor. */
export function playClick(m: Pick<MouseSettings, "click" | "clickVolume" | "clickUrl">): void {
  if (m.click === "none") return;
  const v = Math.max(0, Math.min(1, m.clickVolume / 100));
  if (m.click === "custom") {
    if (!m.clickUrl) return;
    try {
      const a = new Audio(m.clickUrl);
      a.volume = v;
      void a.play().catch(() => {});
    } catch { /* an address that cannot play is simply silent */ }
    return;
  }
  const ac = context();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  switch (m.click) {
    case "pop": tone(ac, "sine", 640, 160, 0.1, 0.55 * v); break;
    case "click": burst(ac, 0.025, 0.9 * v, 1800); break;
    case "tick": tone(ac, "square", 1900, 1700, 0.035, 0.12 * v); break;
    case "chime": tone(ac, "sine", 880, 880, 0.5, 0.3 * v); tone(ac, "sine", 1319, 1319, 0.55, 0.22 * v, 0.07); break;
    case "bubble": tone(ac, "sine", 320, 980, 0.14, 0.5 * v); break;
    case "thud": tone(ac, "sine", 130, 45, 0.16, 0.9 * v); burst(ac, 0.02, 0.25 * v, 300); break;
    default:
  }
}

/* ---------- the cursor ---------- */

const HEART = "M12 21s-7.5-4.6-9.5-9.2C1 8.2 3 5 6.2 5c2 0 3.5 1.1 4.3 2.6h3C14.3 6.1 15.8 5 17.8 5 21 5 23 8.2 21.5 11.8 19.5 16.4 12 21 12 21Z";
const STAR = "M12 2.5l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.7l-6.1 3.4 1.4-6.8L2.2 9.6l6.9-.8Z";
const SPARKLE = "M12 1c.8 6.2 4.8 10.2 11 11-6.2.8-10.2 4.8-11 11-.8-6.2-4.8-10.2-11-11C7.2 11.2 11.2 7.2 12 1Z";

/** The shape of a cursor as SVG, in a 24 by 24 box. */
function cursorSvg(style: MouseSettings["cursor"], color: string): string {
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">`;
  const shadow = `<defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.45"/></filter></defs>`;
  switch (style) {
    case "dot": return `${open}${shadow}<circle cx="12" cy="12" r="6" fill="${color}" filter="url(#s)"/></svg>`;
    case "ring": return `${open}<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
    case "arrow": return `${open}${shadow}<path d="M3 2l17 8.6-7.2 2.1L9.9 20Z" fill="${color}" stroke="#0a0a0a" stroke-width="1.4" stroke-linejoin="round" filter="url(#s)"/></svg>`;
    case "crosshair": return `${open}<g stroke="${color}" stroke-width="2" stroke-linecap="round"><path d="M12 2v7M12 15v7M2 12h7M15 12h7"/></g><circle cx="12" cy="12" r="1.6" fill="${color}"/></svg>`;
    case "heart": return `${open}${shadow}<path d="${HEART}" fill="${color}" filter="url(#s)"/></svg>`;
    case "star": return `${open}${shadow}<path d="${STAR}" fill="${color}" filter="url(#s)"/></svg>`;
    case "sparkle": return `${open}${shadow}<path d="${SPARKLE}" fill="${color}" filter="url(#s)"/></svg>`;
    default: return "";
  }
}

function startCursor(root: HTMLElement, m: MouseSettings, accent: string): () => void {
  if (m.cursor === "default" || matchMedia("(pointer: coarse)").matches) return () => {};
  const color = m.cursorColor || accent;
  const size = m.cursorSize;
  const el = document.createElement("div");
  el.className = "mouse-cur";
  el.style.width = el.style.height = `${size}px`;
  el.hidden = true;
  const topLeft = m.cursor === "arrow" || m.cursor === "custom";
  if (m.cursor === "custom") {
    if (!m.cursorImage) return () => {};
    el.innerHTML = `<img src="${m.cursorImage}" alt="" draggable="false" style="width:100%;height:100%;object-fit:contain">`;
  } else el.innerHTML = cursorSvg(m.cursor, color);
  // The ring follows a little behind, with a small dot exactly on the pointer.
  let dot: HTMLElement | null = null;
  if (m.cursor === "ring") {
    dot = document.createElement("div");
    dot.className = "mouse-cur mouse-dot";
    dot.style.width = dot.style.height = `${Math.max(4, size * 0.22)}px`;
    dot.style.background = color;
    dot.hidden = true;
    root.append(dot);
  }
  root.append(el);
  root.classList.add("has-cursor");

  let tx = 0, ty = 0, x = 0, y = 0, raf = 0, grow = 1, pressed = false, shown = false;
  const ease = m.cursor === "ring" ? 0.22 : 1;
  const paint = (): void => {
    raf = 0;
    x += (tx - x) * ease;
    y += (ty - y) * ease;
    const settled = Math.abs(tx - x) < 0.1 && Math.abs(ty - y) < 0.1;
    if (settled) { x = tx; y = ty; }
    const s = grow * (pressed ? 0.82 : 1);
    const ox = topLeft ? 0 : -size / 2;
    const oy = topLeft ? 0 : -size / 2;
    el.style.transform = `translate3d(${x + ox}px, ${y + oy}px, 0) scale(${s})`;
    el.style.transformOrigin = topLeft ? "0 0" : "50% 50%";
    if (dot) { const d = parseFloat(dot.style.width); dot.style.transform = `translate3d(${tx - d / 2}px, ${ty - d / 2}px, 0)`; }
    if (!settled) raf = requestAnimationFrame(paint);
  };
  const show = (on: boolean): void => {
    if (on === shown) return;
    shown = on;
    el.hidden = !on;
    if (dot) dot.hidden = !on;
  };
  const move = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return;
    const r = root.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) { show(false); return; }
    tx = e.clientX;
    ty = e.clientY;
    if (!shown) { x = tx; y = ty; }
    show(true);
    const over = e.target instanceof Element && e.target.closest(INTERACTIVE) !== null;
    grow = over ? (m.cursor === "ring" ? 1.5 : 1.25) : 1;
    if (!raf) raf = requestAnimationFrame(paint);
  };
  const down = (): void => { pressed = true; if (!raf) raf = requestAnimationFrame(paint); };
  const up = (): void => { pressed = false; if (!raf) raf = requestAnimationFrame(paint); };
  const leave = (): void => show(false);
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerdown", down, { passive: true });
  window.addEventListener("pointerup", up, { passive: true });
  document.documentElement.addEventListener("pointerleave", leave);
  window.addEventListener("blur", leave);
  return () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerdown", down);
    window.removeEventListener("pointerup", up);
    document.documentElement.removeEventListener("pointerleave", leave);
    window.removeEventListener("blur", leave);
    cancelAnimationFrame(raf);
    el.remove();
    dot?.remove();
    root.classList.remove("has-cursor");
  };
}

/* ---------- the trail ---------- */

interface Bit { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; hue: number; rot: number; spin: number; kind: number }

function startTrail(root: HTMLElement, m: MouseSettings, accent: string): () => void {
  if (m.trail === "none" || matchMedia("(pointer: coarse)").matches) return () => {};
  const canvas = document.createElement("canvas");
  canvas.className = "mouse-trail";
  root.append(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return () => {}; }
  let w = 0, h = 0, dpr = 1;
  const fit = (): void => {
    const r = root.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
  ro?.observe(root);

  const life = m.trailLife * 100;
  const size = m.trailSize;
  const bits: Bit[] = [];
  let last: { x: number; y: number } | null = null;
  let raf = 0;
  let acc = 0;
  let hue = 0;

  const colorAt = (b: Bit, a: number): string => {
    if (m.trailRainbow) return `hsla(${b.hue}, 95%, 62%, ${a})`;
    const hex = m.trailColor || accent;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  const spawn = (x: number, y: number, now: number): void => {
    hue = (hue + 9) % 360;
    const j = (): number => (Math.random() - 0.5);
    const base: Bit = { x, y, vx: 0, vy: 0, born: now, life, size, hue, rot: Math.random() * 6.28, spin: j() * 0.01, kind: 0 };
    switch (m.trail) {
      case "sparkles": bits.push({ ...base, x: x + j() * 12, y: y + j() * 12, vx: j() * 0.03, vy: j() * 0.03 + 0.01, size: size * (0.6 + Math.random() * 0.8) }); break;
      case "stars": bits.push({ ...base, x: x + j() * 8, vx: j() * 0.05, vy: 0.04 + Math.random() * 0.05, size: size * (0.7 + Math.random() * 0.7), spin: j() * 0.012 }); break;
      case "hearts": bits.push({ ...base, x: x + j() * 8, vx: j() * 0.04, vy: -0.05 - Math.random() * 0.04, size: size * (0.8 + Math.random() * 0.6), rot: 0, spin: 0 }); break;
      default: bits.push(base);
    }
  };

  const heart = (c: CanvasRenderingContext2D, s: number): void => {
    c.beginPath();
    c.moveTo(0, s * 0.35);
    c.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.5, -s * 0.9, 0, -s * 0.4);
    c.bezierCurveTo(s * 0.5, -s * 0.9, s * 0.9, -s * 0.2, 0, s * 0.35);
    c.fill();
  };
  const star = (c: CanvasRenderingContext2D, s: number, points: number, inner: number): void => {
    c.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? s : s * inner;
      const a = (Math.PI * i) / points - Math.PI / 2;
      if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  };

  const frame = (now: number): void => {
    raf = 0;
    ctx.clearRect(0, 0, w, h);
    for (let i = bits.length - 1; i >= 0; i--) if (now - bits[i]!.born > bits[i]!.life) bits.splice(i, 1);
    if (m.trail === "ribbon" || m.trail === "comet") {
      // A line through the recent places of the pointer, thinner and fainter the older it is.
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < bits.length; i++) {
        const a = bits[i - 1]!;
        const b = bits[i]!;
        const t = 1 - (now - b.born) / b.life;
        if (t <= 0 || Math.hypot(b.x - a.x, b.y - a.y) > 140) continue;
        ctx.strokeStyle = colorAt(b, Math.min(1, t * 0.9));
        ctx.lineWidth = Math.max(0.5, size * 0.55 * t);
        if (m.trail === "comet") { ctx.shadowColor = colorAt(b, 0.9); ctx.shadowBlur = size * 1.4 * t; }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else {
      for (const b of bits) {
        const age = now - b.born;
        const t = 1 - age / b.life;
        b.x += b.vx * 16;
        b.y += b.vy * 16;
        b.rot += b.spin * 16;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        if (m.trail === "dots") {
          ctx.fillStyle = colorAt(b, t * 0.85);
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(0.5, b.size * 0.5 * (0.35 + t * 0.65)), 0, 6.283);
          ctx.fill();
        } else if (m.trail === "glow") {
          const r = b.size * (1.2 + (1 - t) * 1.2);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          g.addColorStop(0, colorAt(b, t * 0.55));
          g.addColorStop(1, colorAt(b, 0));
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, 6.283);
          ctx.fill();
        } else if (m.trail === "sparkles") {
          const twinkle = 0.6 + 0.4 * Math.sin(age * 0.02 + b.hue);
          ctx.fillStyle = colorAt(b, t * twinkle);
          star(ctx, b.size * 0.7 * (0.5 + t * 0.5), 4, 0.28);
        } else if (m.trail === "stars") {
          ctx.fillStyle = colorAt(b, t * 0.9);
          star(ctx, b.size * 0.6 * (0.5 + t * 0.5), 5, 0.45);
        } else if (m.trail === "hearts") {
          ctx.fillStyle = colorAt(b, t * 0.9);
          heart(ctx, b.size * 0.8 * (0.5 + t * 0.5));
        }
        ctx.restore();
      }
    }
    if (bits.length) raf = requestAnimationFrame(frame);
  };
  const kick = (): void => { if (!raf) raf = requestAnimationFrame(frame); };

  const move = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return;
    const r = root.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) { last = null; return; }
    const now = performance.now();
    if (last) {
      const d = Math.hypot(x - last.x, y - last.y);
      if (m.trail === "ribbon" || m.trail === "comet") { spawn(x, y, now); }
      else {
        // One piece for about every few pixels travelled, so a fast move leaves a line and a slow one a few.
        acc += d;
        const gap = Math.max(5, size * 0.7);
        while (acc >= gap) { acc -= gap; const k = 1 - acc / Math.max(1, d); spawn(last.x + (x - last.x) * k, last.y + (y - last.y) * k, now); }
      }
    }
    last = { x, y };
    if (bits.length > 220) bits.splice(0, bits.length - 220);
    kick();
  };
  const leave = (): void => { last = null; };
  window.addEventListener("pointermove", move, { passive: true });
  document.documentElement.addEventListener("pointerleave", leave);
  return () => {
    window.removeEventListener("pointermove", move);
    document.documentElement.removeEventListener("pointerleave", leave);
    cancelAnimationFrame(raf);
    ro?.disconnect();
    canvas.remove();
  };
}

/* ---------- the click ---------- */

function startClick(root: HTMLElement, m: MouseSettings): () => void {
  if (m.click === "none") return () => {};
  const down = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || !root.contains(target)) return;
    if (m.clickLinks && !target.closest(INTERACTIVE)) return;
    playClick(m);
  };
  root.addEventListener("pointerdown", down);
  return () => root.removeEventListener("pointerdown", down);
}

/** Switch on the mouse effects the settings ask for. Returns what switches them off. */
export function startMouse(root: HTMLElement, m: MouseSettings, accent: string): () => void {
  const offs = [startCursor(root, m, accent), startTrail(root, m, accent), startClick(root, m)];
  return () => offs.forEach(fn => fn());
}
