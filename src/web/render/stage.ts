import { PRESENCE_COLORS } from "../../shared/constants";
import type { LyricStyle, RenderModel } from "../../shared/types";
import { lanyard } from "../media/lanyard";
import { onLyricsLoaded } from "../media/lyrics";
import { spotifyNowPlaying, uploadNowPlaying, type NowPlaying } from "../media/nowplaying";
import { player } from "../media/player";
import { copyText } from "../ui/toast";
import { delegate } from "../util/dom";
import { GridField, ParticleField } from "./background";
import { bioLines, cardHTML } from "./card";
import { IslandPanel } from "./island";
import { LyricPanel, panelSignature } from "./lyricpanel";
import { nowCardHTML, tickNowCard } from "./nowcard";
import { presenceCardHTML } from "./presence";
import { applyTheme } from "./theme";
import { startTypewriter } from "./typewriter";

export interface StageOptions {
  /** Fixed card width, used by the preview frame. */
  width?: number;
}

type Source = NowPlaying["source"];

/** What both lyrics styles offer the stage. */
interface LyricView {
  readonly el: HTMLElement;
  readonly signature: string;
  tick(): void;
}

/**
 * A themed profile page that fills its container. Call `update` whenever the model changes;
 * parts that move on their own (music, Discord) keep running across updates.
 */
export class Stage {
  readonly el: HTMLElement;
  private readonly mount: HTMLElement;
  private readonly wrap: HTMLElement;
  private readonly field: ParticleField;
  private readonly grid: GridField;
  private model: RenderModel;
  private readonly cleanups: Array<() => void> = [];
  private stopTyping: () => void = () => {};
  private panel: LyricView | null = null;
  private island: IslandPanel | null = null;
  private islandSource: Source | null = null;
  private openLyrics: Source | null = null;
  private lyricsDecided = false;
  private spotifyOn = false;
  private introTimer = 0;
  private slotKey = "";
  private slotTimer = 0;
  private entrance = "";
  private nowPlaying = new Map<Source, NowPlaying>();
  private tickTimer = 0;
  private cardKey = "";
  private tilt = { x: 0, y: 0 };
  private tiltTo = { x: 0, y: 0 };
  private tiltRaf = 0;

  constructor(model: RenderModel, private readonly opts: StageOptions = {}) {
    this.model = model;
    const el = document.createElement("div");
    el.className = "stage";
    el.innerHTML = `<div class="fx-aurora"><i></i><i></i><i></i></div><canvas class="fx-canvas fx-particles"></canvas><canvas class="fx-canvas fx-grid"></canvas>      <div class="scroll"><div class="wrap"><div class="mount"></div></div></div>`;
    this.el = el;
    // Entrance animations only run for the first moments, so edits in the dashboard never replay them.
    el.classList.add("is-intro");
    this.introTimer = window.setTimeout(() => el.classList.remove("is-intro"), 1600);
    this.mount = el.querySelector<HTMLElement>(".mount")!;
    this.wrap = el.querySelector<HTMLElement>(".wrap")!;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.field = new ParticleField(
      el.querySelector<HTMLCanvasElement>(".fx-particles")!,
      el,
      () => this.model.profile.bgType === "particles",
      () => this.model.profile.colors.accent,
      reduce,
      () => this.model.profile.density,
    );
    this.grid = new GridField(
      el.querySelector<HTMLCanvasElement>(".fx-grid")!,
      el,
      () => this.model.profile.bgType === "grid",
      () => this.model.profile.colors.accent,
      () => this.model.profile.gridSize,
      () => this.model.profile.gridPush,
      reduce,
    );

    el.addEventListener("pointermove", e => this.onPointer(e));
    el.addEventListener("pointerleave", () => this.onLeave());
    this.cleanups.push(delegate(this.mount, "click", "[data-share]", () =>
      void copyText(`${location.origin}/${this.model.username}`, "Profile link copied")));
    this.cleanups.push(delegate(this.wrap, "click", "[data-act]", (_e, t) => this.onControl(t)));
    this.cleanups.push(delegate(this.wrap, "click", "[data-lyr]", (_e, t) => this.toggleLyrics(this.sourceOf(t))));
    this.cleanups.push(delegate(this.wrap, "click", "[data-seek]", (e, t) => this.onSeek(e as MouseEvent, t)));
    this.cleanups.push(lanyard.subscribe(() => this.renderSlot()));
    this.cleanups.push(player.subscribe(() => this.renderSlot()));
    this.cleanups.push(onLyricsLoaded(() => this.renderSlot()));
    this.tickTimer = window.setInterval(() => this.tick(), 250);

    this.update(model);
  }

  /** Redraw for new data. */
  update(model: RenderModel): void {
    this.model = model;
    const p = model.profile;
    applyTheme(this.el, model, this.opts.width);

    player.setQueue(p.music.enabled ? model.tracks : [], { loop: p.music.loop, volume: p.music.volume });
    lanyard.ensure(p.discord.enabled ? model.discordId : null);

    this.stopTyping();
    this.mount.innerHTML = cardHTML(model);
    this.cardKey = "";
    this.updateDot();
    this.renderSlot();
    if (p.typewriter) this.stopTyping = startTypewriter(this.mount.querySelector<HTMLElement>(".bio-text"), bioLines(p.bio));

    if (p.effects.entrance !== this.entrance) {
      this.entrance = p.effects.entrance;
      this.mount.style.animation = "none";
      void this.mount.offsetWidth;
      this.mount.style.animation = p.effects.entrance === "none" ? "" : `ent-${p.effects.entrance} 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards`;
    }
    if (!p.effects.tilt) { this.tiltTo.x = this.tiltTo.y = 0; this.startTilt(); }
  }

  /** Start the uploaded music. Browsers need this to follow a tap. */
  startMusic(): void {
    if (this.model.profile.music.enabled && this.model.profile.music.autoplay) player.play();
  }

  destroy(): void {
    window.clearInterval(this.tickTimer);
    window.clearTimeout(this.introTimer);
    window.clearTimeout(this.slotTimer);
    this.stopTyping();
    this.field.destroy();
    cancelAnimationFrame(this.tiltRaf);
    this.grid.destroy();
    this.island?.destroy();
    this.cleanups.forEach(fn => fn());
    player.setQueue([], { loop: false, volume: this.model.profile.music.volume });
    lanyard.ensure(null);
    this.el.remove();
  }

  /* ---------- music and Discord cards ---------- */

  private collect(): Map<Source, NowPlaying> {
    const p = this.model.profile;
    const out = new Map<Source, NowPlaying>();
    const sp = p.discord.enabled && p.discord.showSpotify ? lanyard.data?.spotify : null;
    // While Spotify is playing, the uploaded songs (and their lyrics) step aside.
    const up = p.music.enabled && !sp ? uploadNowPlaying() : null;
    if (up) out.set("upload", up);
    if (sp) out.set("spotify", spotifyNowPlaying(sp));
    return out;
  }

  private renderSlot(): void {
    const slot = this.mount.querySelector<HTMLElement>(".pslot");
    if (!slot) return;
    const p = this.model.profile;
    const d = lanyard.data;
    this.nowPlaying = this.collect();

    const spotifyOn = this.nowPlaying.has("spotify");
    if (spotifyOn !== this.spotifyOn) {
      this.spotifyOn = spotifyOn;
      if (spotifyOn) {
        // Stop the uploaded song and close its lyrics, so Spotify's own lyrics can open by their setting.
        if (player.playing) player.pause();
        if (this.openLyrics === "upload") this.openLyrics = null;
        this.lyricsDecided = false;
      } else if (this.openLyrics === "spotify") this.openLyrics = null;
    }

    if (!this.lyricsDecided && this.nowPlaying.size) {
      this.lyricsDecided = true;
      if (this.nowPlaying.has("upload") && p.music.lyricsOpen) this.openLyrics = "upload";
      else if (this.nowPlaying.has("spotify") && p.discord.lyricsOpen) this.openLyrics = "spotify";
    }

    const parts: string[] = [];
    if (p.discord.enabled && p.discord.showCard && d) parts.push(presenceCardHTML(d, p.discord.showActivity));
    for (const [source, np] of this.nowPlaying) {
      const s = source === "upload" ? { showProgress: p.music.showProgress, showLyrics: p.music.showLyrics } : { showProgress: p.discord.showProgress, showLyrics: p.discord.showLyrics };
      parts.push(nowCardHTML(np, s));
    }
    const markup = parts.join("");
    if (markup !== this.cardKey) {
      this.cardKey = markup;
      slot.innerHTML = markup;
      // Cards slide in when a new kind of card shows up (a song starts, Discord answers), not on every small change.
      const kinds = [...this.nowPlaying.keys()].join(",") + (p.discord.enabled && p.discord.showCard && d ? ",presence" : "");
      if (kinds !== this.slotKey) {
        this.slotKey = kinds;
        slot.classList.remove("anim");
        void slot.offsetWidth;
        slot.classList.add("anim");
        window.clearTimeout(this.slotTimer);
        this.slotTimer = window.setTimeout(() => slot.classList.remove("anim"), 900);
      }
    }
    this.updateDot();
    this.renderPanel();
    this.tick();
  }

  /** The dot under the picture follows the live Discord status. It stays hidden until Lanyard has answered. */
  private updateDot(): void {
    const dot = this.mount.querySelector<HTMLElement>(".pres");
    if (!dot) return;
    const d = lanyard.data;
    const on = this.model.profile.discord.enabled && d;
    dot.hidden = !on;
    if (on) dot.style.background = PRESENCE_COLORS[d.status];
  }

  private lyricStyle(source: Source): LyricStyle {
    const p = this.model.profile;
    return source === "upload" ? p.music.lyricsStyle : p.discord.lyricsStyle;
  }

  private renderPanel(): void {
    const p = this.model.profile;

    // The side panel: only for the song whose lyrics are open, and only in the "panel" style.
    const panelNp = this.openLyrics && this.lyricStyle(this.openLyrics) === "panel" ? this.nowPlaying.get(this.openLyrics) : undefined;
    if (!panelNp) {
      this.panel?.el.remove();
      this.panel = null;
    } else {
      const signature = panelSignature(panelNp);
      if (!this.panel || this.panel.signature !== signature) {
        this.panel?.el.remove();
        this.panel = new LyricPanel(panelNp, signature, () => this.toggleLyrics(this.openLyrics));
        this.wrap.append(this.panel.el);
      }
    }

    // The island: always there while a song is on, and opens to show its lyrics.
    const source = (["upload", "spotify"] as Source[]).find(x => this.nowPlaying.has(x) && this.lyricStyle(x) === "island");
    const np = source ? this.nowPlaying.get(source) : undefined;
    if (!source || !np) {
      this.island?.destroy();
      this.island = null;
      this.islandSource = null;
      this.el.classList.remove("has-island");
      return;
    }
    const showLyrics = source === "upload" ? p.music.showLyrics : p.discord.showLyrics;
    if (!this.island || this.islandSource !== source) {
      this.island?.destroy();
      this.islandSource = source;
      this.island = new IslandPanel(np, {
        showLyrics,
        onToggle: open => { this.openLyrics = open ? source : null; this.lyricsDecided = true; this.renderPanel(); },
      });
      this.el.append(this.island.el);
    } else {
      this.island.update(np, showLyrics);
    }
    this.el.classList.add("has-island");
    this.island.setOpen(this.openLyrics === source);
  }

  private toggleLyrics(source: Source | null): void {
    this.openLyrics = this.openLyrics === source ? null : source;
    this.lyricsDecided = true;
    this.renderPanel();
    this.tick();
  }

  private tick(): void {
    for (const card of this.mount.querySelectorAll<HTMLElement>(".np-card")) {
      const np = this.nowPlaying.get(card.dataset.np as Source);
      if (np) tickNowCard(card, np);
    }
    this.panel?.tick();
    this.island?.tick();
  }

  private sourceOf(target: HTMLElement): Source | null {
    const card = target.closest<HTMLElement>("[data-np]");
    return (card?.dataset.np as Source | undefined) ?? null;
  }

  private onControl(target: HTMLElement): void {
    const np = this.nowPlaying.get(this.sourceOf(target) ?? "upload");
    const c = np?.controls;
    if (!c) return;
    const act = target.dataset.act;
    if (act === "toggle") c.toggle();
    else if (act === "prev") c.prev();
    else if (act === "next") c.next();
  }

  private onSeek(e: MouseEvent, target: HTMLElement): void {
    const np = this.nowPlaying.get(this.sourceOf(target) ?? "upload");
    if (!np?.controls) return;
    const r = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
    np.controls.seek(ratio * np.durationMs);
    this.tick();
  }

  /* ---------- pointer effects ---------- */

  /**
   * Where the card sits when it is not tilted. Measured from layout rather than getBoundingClientRect,
   * because the tilt itself moves the bounding box and that fed back into the tilt (which made it jitter).
   */
  private restRect(): { left: number; top: number; width: number; height: number } {
    const scroll = this.mount.offsetParent as HTMLElement | null;
    const base = (scroll ?? this.el).getBoundingClientRect();
    return {
      left: base.left + this.mount.offsetLeft - (scroll?.scrollLeft ?? 0),
      top: base.top + this.mount.offsetTop - (scroll?.scrollTop ?? 0),
      width: this.mount.offsetWidth,
      height: this.mount.offsetHeight,
    };
  }

  private onPointer(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    const r = this.el.getBoundingClientRect();
    this.field.pointer(e.clientX - r.left, e.clientY - r.top);
    this.grid.pointer(e.clientX - r.left, e.clientY - r.top);
    const p = this.model.profile;
    const m = this.restRect();
    if (p.effects.cursorGlow) {
      // The light lives inside the card, so it only shows while the pointer is over it.
      const inside = e.clientX >= m.left && e.clientX <= m.left + m.width && e.clientY >= m.top && e.clientY <= m.top + m.height;
      this.mount.classList.toggle("lit", inside);
      if (inside) {
        this.mount.style.setProperty("--mx", `${e.clientX - m.left}px`);
        this.mount.style.setProperty("--my", `${e.clientY - m.top}px`);
      }
    }
    if (p.effects.tilt) {
      const clampN = (n: number): number => Math.max(-1, Math.min(1, n));
      this.tiltTo.y = clampN((e.clientX - (m.left + m.width / 2)) / Math.max(1, r.width / 2)) * 10;
      this.tiltTo.x = -clampN((e.clientY - (m.top + m.height / 2)) / Math.max(1, r.height / 2)) * 10;
      this.startTilt();
    }
  }

  /** Eases the card toward the wanted angle once per frame, so quick pointer moves don't make it stutter. */
  private startTilt(): void {
    if (this.tiltRaf) return;
    const step = (): void => {
      this.tiltRaf = 0;
      const t = this.tilt;
      t.x += (this.tiltTo.x - t.x) * 0.18;
      t.y += (this.tiltTo.y - t.y) * 0.18;
      const settled = Math.abs(this.tiltTo.x - t.x) < 0.02 && Math.abs(this.tiltTo.y - t.y) < 0.02;
      if (settled) { t.x = this.tiltTo.x; t.y = this.tiltTo.y; }
      this.mount.style.transform = t.x === 0 && t.y === 0 ? "" : `perspective(900px) rotateY(${t.y.toFixed(2)}deg) rotateX(${t.x.toFixed(2)}deg)`;
      if (!settled) this.tiltRaf = requestAnimationFrame(step);
    };
    this.tiltRaf = requestAnimationFrame(step);
  }

  private onLeave(): void {
    this.field.leave();
    this.grid.leave();
    this.mount.classList.remove("lit");
    this.tiltTo.x = this.tiltTo.y = 0;
    this.startTilt();
  }
}
