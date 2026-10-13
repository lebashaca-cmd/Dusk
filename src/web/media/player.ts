import type { Track } from "../../shared/types";
import { clamp } from "../util/format";

type Listener = () => void;

/**
 * Plays the songs a person uploaded. There is one player for the whole page, so music keeps
 * going while the editor redraws the preview around it.
 */
class Player {
  readonly audio = new Audio();
  private queue: Track[] = [];
  private index = 0;
  private loop = true;
  private loadedId: string | null = null;
  private listeners = new Set<Listener>();

  constructor() {
    this.audio.preload = "metadata";
    this.audio.addEventListener("ended", () => this.onEnded());
    for (const ev of ["play", "pause", "error"] as const) this.audio.addEventListener(ev, () => this.emit());
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach(fn => fn());
  }

  get current(): Track | null {
    return this.queue[this.index] ?? null;
  }

  get tracks(): readonly Track[] {
    return this.queue;
  }

  get playing(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  positionMs(): number {
    return this.audio.currentTime * 1000;
  }

  /**
   * Called every time the page is redrawn. If the same song is still first in line the music
   * is left alone; if the song was removed, playback stops and the queue starts over.
   */
  setQueue(tracks: Track[], opts: { loop: boolean; volume: number }): void {
    this.loop = opts.loop;
    this.audio.volume = clamp(opts.volume, 0, 1);
    const before = this.queue.map(t => t.id).join(",");
    this.queue = tracks;
    const keep = tracks.findIndex(t => t.id === this.loadedId);
    if (keep >= 0) this.index = keep;
    else {
      this.audio.pause();
      this.index = 0;
      this.load(false);
    }
    if (before !== tracks.map(t => t.id).join(",")) this.emit();
  }

  private load(autoplay: boolean): void {
    const track = this.current;
    if (!track) {
      this.audio.removeAttribute("src");
      this.loadedId = null;
      return;
    }
    if (this.loadedId !== track.id) {
      this.audio.src = track.audioUrl;
      this.loadedId = track.id;
    }
    if (autoplay) void this.audio.play().catch(() => { /* blocked until the person taps */ });
    this.emit();
  }

  /** Start playing. Browsers only allow this after a tap or click. */
  play(): void {
    if (!this.current) return;
    if (!this.loadedId) this.load(false);
    void this.audio.play().catch(() => { /* blocked until the person taps */ });
  }

  pause(): void {
    this.audio.pause();
  }

  toggle(): void {
    if (this.playing) this.pause(); else this.play();
  }

  next(): void {
    if (!this.queue.length) return;
    const wasPlaying = this.playing;
    this.index = (this.index + 1) % this.queue.length;
    this.load(wasPlaying);
  }

  prev(): void {
    if (!this.queue.length) return;
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    const wasPlaying = this.playing;
    this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this.load(wasPlaying);
  }

  seek(ms: number): void {
    if (Number.isFinite(ms)) this.audio.currentTime = Math.max(0, ms / 1000);
  }

  private onEnded(): void {
    const last = this.index >= this.queue.length - 1;
    if (!last) { this.index += 1; this.load(true); return; }
    if (this.loop && this.queue.length) {
      this.index = 0;
      if (this.queue.length === 1) { this.audio.currentTime = 0; this.play(); } else this.load(true);
      return;
    }
    this.audio.currentTime = 0;
    this.emit();
  }
}

export const player = new Player();
