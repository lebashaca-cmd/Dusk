import { hexToRgb } from "../util/format";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** Faint drifting dots that connect to the pointer, drawn on a canvas behind the profile. */
export class ParticleField {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private w = 0;
  private h = 0;
  private points: Particle[] = [];
  private mx = -999;
  private my = -999;
  private raf = 0;
  private cleared = false;
  private builtFor = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private readonly isActive: () => boolean,
    private readonly accent: () => string,
    private readonly reduceMotion: boolean,
    private readonly density: () => number = () => 1,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    this.ctx = ctx;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.raf = requestAnimationFrame(this.frame);
  }

  pointer(x: number, y: number): void {
    this.mx = x;
    this.my = y;
  }

  leave(): void {
    this.mx = this.my = -999;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.host.clientWidth;
    this.h = this.host.clientHeight;
    if (!this.w || !this.h) return;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.builtFor = this.density();
    const count = Math.max(8, Math.min(260, Math.round(((this.w * this.h) / 16000) * this.builtFor)));
    this.points = Array.from({ length: count }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: Math.random() * 1.2 + 0.4,
    }));
  }

  private readonly frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.isActive() || !this.w || !this.host.getClientRects().length) {
      if (!this.cleared) { this.ctx.clearRect(0, 0, this.w, this.h); this.cleared = true; }
      return;
    }
    this.cleared = false;
    if (this.density() !== this.builtFor) this.resize();
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const [r, g, b] = hexToRgb(this.accent());
    for (const p of this.points) {
      if (!this.reduceMotion) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0;
      }
      ctx.fillStyle = `rgba(${r},${g},${b},0.45)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      const d = Math.hypot(p.x - this.mx, p.y - this.my);
      if (d < 140) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d / 140) * 0.4})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(this.mx, this.my);
        ctx.stroke();
      }
    }
  };
}

/**
 * A grid of lines that bends away from the pointer, like pressing a finger into fabric.
 * The push eases in and out so the lines settle back smoothly when the pointer leaves.
 */
export class GridField {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private w = 0;
  private h = 0;
  private mx = -999;
  private my = -999;
  private tx = -999;
  private ty = -999;
  private amount = 0;
  private raf = 0;
  private cleared = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private readonly isActive: () => boolean,
    private readonly accent: () => string,
    private readonly size: () => number,
    private readonly push: () => number,
    private readonly reduceMotion: boolean,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    this.ctx = ctx;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.raf = requestAnimationFrame(this.frame);
  }

  pointer(x: number, y: number): void {
    if (this.amount < 0.02) { this.mx = x; this.my = y; }
    this.tx = x;
    this.ty = y;
  }

  leave(): void {
    this.tx = this.ty = -999;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.host.clientWidth;
    this.h = this.host.clientHeight;
    if (!this.w || !this.h) return;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private readonly frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.isActive() || !this.w || !this.host.getClientRects().length) {
      if (!this.cleared) { this.ctx.clearRect(0, 0, this.w, this.h); this.cleared = true; }
      return;
    }
    this.cleared = false;

    const on = this.tx > -900 && !this.reduceMotion;
    this.amount += ((on ? 1 : 0) - this.amount) * 0.12;
    if (on) { this.mx += (this.tx - this.mx) * 0.25; this.my += (this.ty - this.my) * 0.25; }

    const { ctx, w, h } = this;
    const cell = Math.max(16, this.size());
    const radius = Math.max(120, cell * 4.5);
    const strength = (this.push() / 100) * cell * 1.1 * this.amount;
    const [r, g, b] = hexToRgb(this.accent());
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${r},${g},${b},0.16)`;

    const step = Math.max(6, cell / 4);
    const bend = (x: number, y: number): [number, number] => {
      if (strength < 0.05) return [x, y];
      const dx = x - this.mx;
      const dy = y - this.my;
      const d = Math.hypot(dx, dy);
      if (d >= radius || d < 0.001) return [x, y];
      const f = (1 - d / radius) ** 2 * strength;
      return [x + (dx / d) * f, y + (dy / d) * f];
    };

    ctx.beginPath();
    for (let x = 0; x <= w + cell; x += cell) {
      for (let y = 0; y <= h + step; y += step) {
        const [px, py] = bend(x, y);
        if (y === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
    }
    for (let y = 0; y <= h + cell; y += cell) {
      for (let x = 0; x <= w + step; x += step) {
        const [px, py] = bend(x, y);
        if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  };
}
