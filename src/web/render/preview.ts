import type { RenderModel } from "../../shared/types";

/** #rrggbb to a colour with the given alpha. */
function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Round the corners of a path into the current path. */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text that is cut off with an ellipsis when it does not fit. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * Draw the page as a picture that can be shared: the same colours, the same name, the
 * same links, at the size social platforms use for a preview.
 */
export function drawShareImage(canvas: HTMLCanvasElement, model: RenderModel): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;

  const p = model.profile;
  const c = p.colors;

  // The background: a twilight gradient with a low sun.
  const sky = ctx.createLinearGradient(0, 0, W * 0.4, H);
  sky.addColorStop(0, c.bg);
  sky.addColorStop(1, c.bg2);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.78, H * 0.22, 0, W * 0.78, H * 0.22, W * 0.55);
  glow.addColorStop(0, rgba(c.accent, 0.4));
  glow.addColorStop(1, rgba(c.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // The mark: a sun going down behind the horizon.
  ctx.save();
  ctx.translate(W - 190, 120);
  ctx.strokeStyle = rgba(c.accent, 0.9);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgba(c.accent, 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-110, 46);
  ctx.lineTo(110, 46);
  ctx.strokeStyle = rgba(c.accent, 0.9);
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  const left = 84;
  let y = 176;

  // The name.
  ctx.fillStyle = c.text;
  ctx.font = "800 78px Inter, 'Segoe UI', sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fit(ctx, p.name || model.username, W - left - 260), left, y);
  y += 44;

  // The handle.
  ctx.fillStyle = c.dim;
  ctx.font = "500 28px Inter, 'Segoe UI', sans-serif";
  ctx.fillText(`@${model.username}`, left, y);
  y += 62;

  // The first line of the bio.
  const bio = p.bio.split("\n").map(l => l.trim()).filter(Boolean)[0] ?? "";
  if (bio) {
    ctx.fillStyle = c.text;
    ctx.globalAlpha = 0.82;
    ctx.font = "400 32px Inter, 'Segoe UI', sans-serif";
    ctx.fillText(fit(ctx, bio, W - left * 2), left, y);
    ctx.globalAlpha = 1;
    y += 56;
  }

  // Up to three links, as pills.
  const links = p.links.filter(l => l.label.trim() || l.url.trim()).slice(0, 3);
  let x = left;
  const pillY = H - 168;
  ctx.font = "600 24px Inter, 'Segoe UI', sans-serif";
  for (const l of links) {
    const text = l.label.trim() || l.url;
    const w = Math.min(430, ctx.measureText(text).width + 56);
    if (x + w > W - left) break;
    roundRect(ctx, x, pillY, w, 56, 28);
    ctx.fillStyle = rgba(c.text, 0.07);
    ctx.fill();
    ctx.strokeStyle = rgba(c.text, 0.2);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = c.text;
    ctx.fillText(fit(ctx, text, w - 40), x + 20, pillY + 36);
    x += w + 14;
  }

  // The wordmark, in the corner.
  ctx.fillStyle = c.dim;
  ctx.font = "700 24px 'Space Grotesk', Inter, sans-serif";
  ctx.fillText("dusk", left, H - 56);
  ctx.fillStyle = rgba(c.dim, 0.7);
  ctx.font = "400 20px Inter, 'Segoe UI', sans-serif";
  ctx.fillText("a page for everything you", left + 60, H - 56);
}
