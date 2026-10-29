import { EMBED_IMAGES, type BoardBox, type EmbedBox, type EmbedDesign, type EmbedKind } from "../../../shared/types";
import { defaultEmbedDesign, defaultGateDesign, embedKindOf, embedSvg, EMBED_H, EMBED_W, MAX_EMBED_BOXES, type EmbedCtx } from "../../../shared/embedcard";
import { store } from "../../state";
import { chooseMedia } from "../../ui/media";
import { delegate, esc } from "../../util/dom";
import { bindFields, group, selectField, textField, toggle, type Pane } from "./fields";
import { attachMoves, GRID, HANDLES } from "./pbmove";

const IMAGE_LABELS: Record<(typeof EMBED_IMAGES)[number], string> = {
  card: "The picture I design below",
  avatar: "My profile picture",
  background: "My background picture",
  none: "No picture",
};

const KIND_LABEL: Record<EmbedKind, string> = { text: "Text", links: "Links", avatar: "Profile picture", image: "Picture", shape: "Shape", logo: "Mark" };
const ADD_ORDER: EmbedKind[] = ["text", "links", "avatar", "image", "shape", "logo"];

const firstLine = (s: string): string => s.split("\n").map(l => l.trim()).find(Boolean) ?? "";
const isVideo = (u: string): boolean => /\.(mp4|webm|ogg)(\?|$)/i.test(u);

/** What the picture is drawn with: this page's own name, words, links and pictures. */
function ctxOf(): EmbedCtx {
  const p = store.profile;
  const me = store.me;
  const name = p.name || me?.user.username || "you";
  return {
    colors: p.colors,
    name,
    username: me?.user.username ?? "",
    bio: firstLine(p.bio),
    views: me?.views ?? 0,
    links: p.links.map(l => l.label.trim() || l.url.trim()).filter(Boolean).slice(0, 8),
    tag: me?.user.serverTag?.tag ?? "",
    href: (src, url) => {
      if (src === "avatar") return me?.avatarUrl ?? me?.user.discordAvatarUrl ?? null;
      if (src === "background") return me?.vip && p.bgImage && !isVideo(p.bgImage) ? p.bgImage : null;
      return url || null;
    },
  };
}

/** The design that is shown: the owner's, or the standard one. */
const shownDesign = (): EmbedDesign => store.profile.embed.design ?? defaultEmbedDesign();

/** The same lines the server fills in when the link is shared. */
function fill(text: string): string {
  const c = ctxOf();
  return text.replace(/\{(name|username|views|links)\}/g, (_m, k: string) => ({ name: c.name, username: c.username, views: String(c.views), links: String(c.links.length) })[k] ?? "");
}

/** The picture the preview shows, as markup. The designed picture is drawn here; the other choices are plain pictures. */
function pictureHTML(idp: string): string {
  const p = store.profile;
  const user = store.me?.user;
  switch (p.embed.image) {
    case "none": return "";
    case "avatar": {
      const src = store.me?.avatarUrl ?? user?.discordAvatarUrl;
      if (src) return `<img class="emb-img" src="${esc(src)}" alt="">`;
      break;
    }
    case "background":
      if (store.me?.vip && p.bgImage && !isVideo(p.bgImage)) return `<img class="emb-img" src="${esc(p.bgImage)}" alt="">`;
      break;
    default:
  }
  return `<div class="emb-img emb-svg">${embedSvg(shownDesign(), ctxOf(), idp)}</div>`;
}

/** A drawing of how a link looks in Discord: the colour bar, the site, the title, the words and the picture. */
function previewHTML(): string {
  const p = store.profile;
  const e = p.embed;
  const name = p.name || store.me?.user.username || "you";
  const title = fill(e.title.trim()).trim() || `${name} · dusk`;
  const bio = firstLine(p.bio);
  const desc = fill(e.desc.trim()).trim() || (bio ? (bio.length > 160 ? `${bio.slice(0, 157)}…` : bio) : "A page on dusk.");
  const site = fill(e.site.trim()).trim() || "dusk";
  const color = e.color || p.colors.accent;
  const pic = pictureHTML("pv");
  return `<div class="emb${pic && !e.large ? " small" : ""}" style="--emb:${esc(color)}">
    <div class="emb-body">
      <span class="emb-site">${esc(site)}</span>
      <b class="emb-title">${esc(title)}</b>
      <p class="emb-desc">${esc(desc)}</p>
      ${pic && e.large ? pic : ""}
    </div>
    ${pic && !e.large ? pic : ""}
  </div>`;
}

/* ---------- small option pieces ---------- */

const slider = (field: string, label: string, value: number, min: number, max: number, unit = "", step = 1): string =>
  `<label class="fld">${esc(label)}<em>${Math.round(value * 100) / 100}${unit}</em><input type="range" data-ed-num="${field}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;

const seg = (label: string, field: string, options: ReadonlyArray<readonly [string, string]>, current: string): string =>
  `<div class="pboard-opt"><span>${esc(label)}</span><div class="seg wrap" role="group" aria-label="${esc(label)}">${options.map(([v, l]) =>
    `<button type="button" class="seg-btn" data-ed-set="${field}:${v}" aria-pressed="${v === current}">${esc(l)}</button>`).join("")}</div></div>`;

const flag = (field: string, label: string, on: boolean): string =>
  `<label class="sw"><span>${esc(label)}</span><input type="checkbox" data-ed-flag="${field}"${on ? " checked" : ""}></label>`;

/** A colour that can also be "the page's own": the buttons beside it put that back. */
function colour(field: string, label: string, value: string | undefined, shown: string, named: ReadonlyArray<readonly [string, string]>): string {
  const isHex = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  return `<div class="pboard-opt"><span>${esc(label)}</span><div class="emb-colrow">
    <input type="color" data-ed-col="${field}" value="${isHex ? value : shown}" aria-label="${esc(label)}">
    ${named.map(([v, l]) => `<button type="button" class="seg-btn" data-ed-set="${field}:${v}" aria-pressed="${(value ?? "") === v}">${esc(l)}</button>`).join("")}
  </div></div>`;
}

/** The pane: how a link to the page looks when it is posted, with a drawing of it, and the picture can be arranged by hand. */
export const embedPane: Pane = {
  id: "embed",
  label: "Embed",
  hint: "How your link looks when someone posts it in Discord and other apps.",
  wide: true,
  mount: el => mountDesigner(el, "embed"),
};

/** The enter screen, arranged the same way: drag, size and add pieces, and put a video behind them. */
export const gatePane: Pane = {
  id: "gate",
  label: "Enter screen",
  hint: "The screen people tap before your page opens.",
  wide: true,
  mount: el => mountDesigner(el, "gate"),
};

function mountDesigner(el: HTMLElement, kind: "embed" | "gate"): () => void {
  {
    const gate = kind === "gate";
    const cleanups: Array<() => void> = [];
    let selected: string | null = null;
    let scale = 1;
    let detachMoves: (() => void) | null = null;

    const design = (): EmbedDesign | null => (gate ? store.profile.page.gate : store.profile.embed.design);
    const setDesign = (d: EmbedDesign | null): void => { if (gate) store.profile.page.gate = d; else store.profile.embed.design = d; };
    const standard = (): EmbedDesign => (gate ? defaultGateDesign(store.profile.page.enterText || "tap to enter") : defaultEmbedDesign());
    const boxes = (): EmbedBox[] => design()?.boxes ?? [];
    const kindOf = (b: EmbedBox): EmbedKind => embedKindOf(b.id) ?? "text";
    const picked = (): EmbedBox | undefined => boxes().find(b => b.id === selected);

    const save = (): void => store.profileChanged();

    /* ----- the page: the words and the look on one side, the designer on the other ----- */
    const draw = (): void => {
      detachMoves?.();
      detachMoves = null;
      const e = store.profile.embed;
      const address = `${location.origin}/${encodeURIComponent(store.me?.user.username ?? "")}`;
      if (gate) {
        const pg = store.profile.page;
        el.innerHTML = `<div class="emb-layout"><div class="emb-side">${group("Enter screen",
          toggle("page.enter", "Show an enter screen first", pg.enter) +
          textField("page.enterText", "Enter screen text", pg.enterText, { max: 24 }) +
          `<p class="note">People see this before your page opens, and it is also what starts your music. Without a design of your own it is just these words on a dark blur. Arrange your own to add pictures, shapes and a video. The whole screen is the picture you see here, so on a tall phone it is shown smaller.</p>`)}</div>
          <div class="emb-design" data-emb-design></div></div>`;
        drawDesigner();
        return;
      }
      el.innerHTML = `<div class="emb-layout">
        <div class="emb-side">${[
          group("Preview", `<div class="emb-stage" data-emb-preview>${previewHTML()}</div>
            <p class="note">A drawing of the link ${esc(address)} in a Discord message. Discord keeps a link it has already seen for a while, so a change can take some time to show on one that was posted before. Updates to dusk itself refresh the picture's address, so apps fetch a new one.</p>
            <button class="btn-ghost" type="button" data-emb-fresh style="justify-content:center">Copy a fresh link</button>
            <p class="note">Posting the fresh link makes Discord read your page again, so it shows what you have now. It opens the same page.</p>`),
          group("Words",
            textField("embed.title", "Title", e.title, { max: 70, placeholder: `${store.profile.name || "Your name"} · dusk` }) +
            `<label class="fld">Description<textarea data-p="embed.desc" data-t="text" maxlength="200" placeholder="The first line of your bio">${esc(e.desc)}</textarea></label>` +
            textField("embed.site", "Small line above the title", e.site, { max: 40, placeholder: "dusk" }) +
            `<p class="note">Leave a box empty to use the default. You can write <code>{name}</code>, <code>{username}</code>, <code>{views}</code> or <code>{links}</code> and they are filled in for you.</p>`),
          group("Look",
            `<div class="emb-color"><label class="clr">Bar colour<input type="color" data-p="embed.color" data-t="color" value="${esc(e.color || store.profile.colors.accent)}"></label>
              <button class="btn-ghost" type="button" data-emb-reset-color${e.color ? "" : " disabled"}>Use my accent colour</button></div>` +
            selectField("embed.image", "Picture", e.image, EMBED_IMAGES.map(i => [i, IMAGE_LABELS[i]] as const)) +
            (e.image === "background" && !store.me?.vip ? `<p class="note">A picture background is for VIP members, so the designed picture is shown instead.</p>` : "") +
            (e.image === "background" && store.me?.vip && !store.profile.bgImage ? `<p class="note">You have not set a picture background yet, so the designed picture is shown instead.</p>` : "") +
            (e.image !== "none" ? toggle("embed.large", "Show the picture big, under the words", e.large) : "")),
        ].join("")}</div>
        <div class="emb-design" data-emb-design></div>
      </div>`;
      drawDesigner();
    };

    const refreshPreview = (): void => {
      const box = el.querySelector<HTMLElement>("[data-emb-preview]");
      if (box) box.innerHTML = previewHTML();
    };

    /* ----- the designer ----- */
    let canvas: HTMLElement | null = null;
    let art: HTMLElement | null = null;
    let scaleBox: HTMLElement | null = null;
    let frame: HTMLElement | null = null;
    let optsEl: HTMLElement | null = null;

    const cardOf = (id: string): HTMLElement | null => canvas?.querySelector<HTMLElement>(`.fbox[data-widget="${id}"]`) ?? null;

    /** The picture drawn from the design, with the piece being dragged drawn where the pointer has taken it. */
    const drawArt = (live?: { id: string; x: number; y: number; w: number; h: number }): void => {
      if (!art) return;
      const d = design() ?? standard();
      const shown: EmbedDesign = live ? { ...d, boxes: d.boxes.map(b => (b.id === live.id ? { ...b, ...live } : b)) } : d;
      art.innerHTML = embedSvg(shown, ctxOf(), "ed", Boolean(d.bg.video));
    };

    /** The video behind the pieces in the designer, as it will play. */
    const syncVideo = (): void => {
      const v = canvas?.querySelector<HTMLVideoElement>("[data-emb-vid]");
      const src = design()?.bg.video ?? "";
      if (!v) return;
      v.hidden = !src;
      if (src && v.getAttribute("src") !== src) { v.src = src; void v.play().catch(() => {}); }
      if (!src) v.removeAttribute("src");
    };

    const syncFrame = (): void => {
      if (!frame || !frame.isConnected) return;
      const card = selected ? cardOf(selected) : null;
      frame.hidden = !card;
      if (!card) return;
      frame.dataset.for = selected ?? "";
      frame.classList.toggle("locked", Boolean(picked()?.locked));
      frame.style.left = `${card.offsetLeft}px`;
      frame.style.top = `${card.offsetTop}px`;
      frame.style.width = `${card.offsetWidth}px`;
      frame.style.height = `${card.offsetHeight}px`;
    };

    const layout = (b: EmbedBox): void => {
      const card = cardOf(b.id);
      if (!card) return;
      card.style.left = `${b.x}px`;
      card.style.top = `${b.y}px`;
      card.style.width = `${b.w}px`;
      card.style.height = `${b.h}px`;
    };

    /** Whether a piece draws nothing yet, so its box is shown as an empty frame. */
    const isEmpty = (b: EmbedBox): boolean => {
      const k = kindOf(b);
      const c = ctxOf();
      if (k === "text") return !(b.text ?? "").trim();
      if (k === "links") return c.links.length === 0;
      if (k === "image") return !c.href(b.src ?? "background", b.url);
      return false;
    };

    const fitScale = (): void => {
      if (!canvas || !scaleBox) return;
      const room = (el.querySelector<HTMLElement>("[data-emb-design]")?.clientWidth ?? EMBED_W) - 2;
      scale = Math.max(0.25, Math.min(1, room / EMBED_W));
      canvas.style.transform = `scale(${scale})`;
      canvas.style.setProperty("--inv", String(Math.min(2.6, 1 / scale)));
      scaleBox.style.width = `${Math.round(EMBED_W * scale)}px`;
      scaleBox.style.height = `${Math.round(EMBED_H * scale)}px`;
    };

    const select = (id: string | null): void => {
      selected = id;
      canvas?.querySelectorAll<HTMLElement>(".fbox").forEach(c => c.classList.toggle("sel", c.dataset.widget === id));
      syncFrame();
      drawOpts();
    };

    /** Where a new piece can go, a little off from the last. */
    const nextId = (kind: EmbedKind): string => {
      const used = new Set(boxes().map(b => b.id));
      if (!used.has(kind) && (kind === "logo" || kind === "links")) return kind;
      for (let n = 1; n < 100; n++) if (!used.has(`${kind}:${n}`)) return `${kind}:${n}`;
      return `${kind}:${Date.now() % 1000}`;
    };

    const add = (kind: EmbedKind): void => {
      const d = design();
      if (!d) return;
      if (d.boxes.length >= MAX_EMBED_BOXES) return;
      const n = d.boxes.length;
      const at = { x: 120 + (n % 6) * 28, y: 120 + (n % 6) * 28 };
      const base: Record<EmbedKind, Partial<EmbedBox>> = {
        text: { w: 520, h: 64, text: "Your text", size: 44, wt: 700, align: "left" },
        links: { w: 760, h: 64, size: 24, count: 3, align: "left" },
        avatar: { w: 220, h: 220, src: "avatar", shape: "circle", fit: "cover", strokeW: 0 },
        image: { w: 360, h: 240, src: "media", shape: "round", radius: 28, fit: "cover" },
        shape: { w: 360, h: 120, fill: "accent", fillOp: 30, radius: 28, strokeW: 0 },
        logo: { w: 220, h: 112 },
      };
      const box = { id: nextId(kind), ...at, w: 200, h: 80, fixedH: true, ...base[kind] } as EmbedBox;
      d.boxes.push(box);
      selected = box.id;
      save();
      drawDesigner();
    };

    const remove = (id: string): void => {
      const d = design();
      if (!d) return;
      d.boxes = d.boxes.filter(b => b.id !== id);
      if (selected === id) selected = null;
      save();
      drawDesigner();
    };

    const duplicate = (id: string): void => {
      const d = design();
      const b = d?.boxes.find(x => x.id === id);
      if (!d || !b || d.boxes.length >= MAX_EMBED_BOXES) return;
      const copy: EmbedBox = { ...structuredClone(b), id: nextId(kindOf(b)), x: Math.min(EMBED_W - 24, b.x + 28), y: Math.min(EMBED_H - 24, b.y + 28) };
      d.boxes.push(copy);
      selected = copy.id;
      save();
      drawDesigner();
    };

    const reorder = (id: string, by: number): void => {
      const d = design();
      if (!d) return;
      const i = d.boxes.findIndex(b => b.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= d.boxes.length) return;
      const [moved] = d.boxes.splice(i, 1);
      d.boxes.splice(j, 0, moved!);
      save();
      drawDesigner();
    };

    /** The options of the picked piece, under the picture. */
    const drawOpts = (): void => {
      if (!optsEl) return;
      const b = picked();
      if (!b) {
        optsEl.innerHTML = `<p class="note">Click a piece to change it. Drag a piece to move it, pull its corners and edges to size it. Hold Alt to move without snapping, and Shift on a corner to keep its shape. The arrow keys nudge it, Delete removes it.</p>`;
        return;
      }
      const k = kindOf(b);
      const text = (label: string, field: string, value: string, o: { area?: boolean; max?: number; placeholder?: string } = {}): string =>
        o.area
          ? `<label class="fld">${esc(label)}<textarea data-ed-str="${field}" maxlength="${o.max ?? 300}" placeholder="${esc(o.placeholder ?? "")}">${esc(value)}</textarea></label>`
          : `<label class="fld">${esc(label)}<input type="text" data-ed-str="${field}" maxlength="${o.max ?? 300}" value="${esc(value)}" placeholder="${esc(o.placeholder ?? "")}"></label>`;
      const c = store.profile.colors;
      const parts: string[] = [];
      if (k === "text") {
        parts.push(
          text("Words", "text", b.text ?? "", { area: true, placeholder: "Write something" }),
          `<p class="note">These are filled in for you: <code>{name}</code> <code>{username}</code> <code>{bio}</code> <code>{views}</code> <code>{links}</code> <code>{tag}</code> (your server tag).</p>`,
          slider("size", "Size", b.size ?? 40, 10, 200, "px"),
          seg("Weight", "wt", [["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"], ["800", "Heavy"]], String(b.wt ?? 600)),
          seg("Align", "align", [["left", "Left"], ["center", "Centre"], ["right", "Right"]], b.align ?? "left"),
          colour("color", "Colour", b.color, c.text, [["", "Page text"], ["dim", "Soft"], ["accent", "Accent"]]),
        );
      } else if (k === "links") {
        parts.push(
          `<p class="note">Shows the first links of your page as pills. Change them in Links.</p>`,
          slider("size", "Size", b.size ?? 24, 12, 60, "px"),
          slider("count", "How many", b.count ?? 3, 1, 8),
          seg("Align", "align", [["left", "Left"], ["center", "Centre"], ["right", "Right"]], b.align ?? "left"),
          colour("color", "Writing", b.color, c.text, [["", "Page text"], ["dim", "Soft"], ["accent", "Accent"]]),
          colour("fill", "Pill colour", b.fill, c.text, [["", "Writing colour"]]),
          slider("fillOp", "Pill fill", b.fillOp ?? 7, 0, 60, "%"),
        );
      } else if (k === "avatar" || k === "image") {
        if (k === "image") {
          parts.push(
            seg("Picture", "src", [["media", "A file of mine"], ["background", "My background"]], b.src ?? "media"),
            (b.src ?? "media") === "media" ? `<button class="btn-ghost" type="button" data-ed-pick style="justify-content:center">${b.url ? "Choose another file" : "Choose a file from my device"}</button>` : "",
          );
        } else parts.push(`<p class="note">Your profile picture, from your page or your Discord.</p>`);
        parts.push(
          seg("Shape", "shape", [["circle", "Circle"], ["round", "Rounded"], ["square", "Square"]], b.shape ?? (k === "avatar" ? "circle" : "round")),
          (b.shape ?? (k === "avatar" ? "circle" : "round")) === "round" ? slider("radius", "Roundness", b.radius ?? 28, 0, 200, "px") : "",
          seg("Fills the box", "fit", [["cover", "Cover"], ["contain", "Fit inside"]], b.fit ?? "cover"),
          slider("strokeW", "Outline", b.strokeW ?? 0, 0, 24, "px"),
          (b.strokeW ?? 0) > 0 ? colour("stroke", "Outline colour", b.stroke, c.accent, [["accent", "Accent"], ["text", "Page text"]]) : "",
        );
      } else if (k === "shape") {
        parts.push(
          colour("fill", "Fill", b.fill, c.accent, [["accent", "Accent"], ["dim", "Soft"], ["text", "Page text"]]),
          slider("fillOp", "Fill strength", b.fillOp ?? 100, 0, 100, "%"),
          slider("radius", "Roundness", b.radius ?? 24, 0, 300, "px"),
          slider("strokeW", "Outline", b.strokeW ?? 0, 0, 24, "px"),
          (b.strokeW ?? 0) > 0 ? colour("stroke", "Outline colour", b.stroke, c.text, [["text", "Page text"], ["accent", "Accent"]]) : "",
        );
      } else {
        parts.push(colour("color", "Colour", b.color, c.accent, [["", "Accent"], ["text", "Page text"], ["dim", "Soft"]]));
      }
      parts.push(slider("op", "How solid", b.op ?? 100, 10, 100, "%"));
      const num = (f: "x" | "y" | "w" | "h", l: string): string => `<label class="emb-pos">${l}<input type="number" data-ed-pos="${f}" value="${Math.round(b[f])}" step="1"></label>`;
      optsEl.innerHTML = `<div class="emb-optshead"><b>${esc(KIND_LABEL[k])}</b>
          <span class="emb-actions">
            <button type="button" class="seg-btn" data-ed-act="forward" title="Bring forward">Forward</button>
            <button type="button" class="seg-btn" data-ed-act="back" title="Send back">Back</button>
            <button type="button" class="seg-btn" data-ed-act="dup">Duplicate</button>
            <button type="button" class="seg-btn" data-ed-act="del">Delete</button>
          </span></div>
        <div class="emb-pos-row">${num("x", "X")}${num("y", "Y")}${num("w", "Width")}${num("h", "Height")}</div>
        ${flag("locked", "Keep it where it is", Boolean(b.locked))}
        ${parts.join("")}`;
    };

    /** The background options under the picture. */
    const bgHTML = (): string => {
      const d = design();
      if (!d) return "";
      const bg = d.bg;
      return `<div class="emb-bg">
        ${seg("Background", "bg.mode", [["page", "My page's colours"], ["solid", "One colour"], ["gradient", "Gradient"], ["image", "Picture"]], bg.mode)}
        ${bg.mode === "solid" || bg.mode === "gradient" ? `<div class="emb-colrow"><input type="color" data-ed-col="bg.c1" value="${esc(bg.c1)}" aria-label="First colour">${bg.mode === "gradient" ? `<input type="color" data-ed-col="bg.c2" value="${esc(bg.c2)}" aria-label="Second colour">` : ""}</div>` : ""}
        ${bg.mode === "gradient" ? slider("bg.angle", "Angle", bg.angle, 0, 360, "°", 5) : ""}
        ${bg.mode === "image" ? `${seg("Picture", "bg.src", [["media", "A file of mine"], ["background", "My background"]], bg.src)}${bg.src === "media" ? `<button class="btn-ghost" type="button" data-ed-pickbg style="justify-content:center">${bg.url ? "Choose another file" : "Choose a file from my device"}</button>` : ""}${slider("bg.dim", "Darken it", bg.dim, 0, 90, "%", 5)}` : ""}
        ${bg.mode !== "image" && !bg.video ? flag("bg.glow", "Soft light of my accent colour", bg.glow) : ""}
        <div class="emb-video"><h4>Video behind it</h4>
          <label class="fld">Video address<input type="text" data-ed-str="bg.video" data-ed-vid maxlength="300" value="${esc(bg.video)}" placeholder="https://…/clip.mp4"></label>
          <div class="emb-colrow"><button class="btn-ghost" type="button" data-ed-pickvideo>Choose a video from my device</button>${bg.video ? `<button class="btn-ghost" type="button" data-ed-clearvideo>Remove it</button>` : ""}</div>
          ${bg.video && bg.mode !== "image" ? slider("bg.dim", "Darken it", bg.dim, 0, 90, "%", 5) : ""}
          <p class="note">${gate ? "It plays muted on a loop behind your pieces, across the whole screen. MP4 or WebM works best, and a short one keeps your page quick." : "Apps that can play a video, such as Discord, show it in place of the still picture when your link is posted. Others show the still picture. It has to be a direct MP4 or WebM file, and Discord only plays small ones."}</p>
        </div>
      </div>`;
    };

    /** The designer: the tools, the picture with its pieces, the options of the piece that is picked, and the background. */
    function drawDesigner(): void {
      const host = el.querySelector<HTMLElement>("[data-emb-design]");
      detachMoves?.();
      detachMoves = null;
      canvas = art = scaleBox = frame = optsEl = null;
      if (!host) return;
      const e = store.profile.embed;
      if (!gate && e.image !== "card") {
        host.innerHTML = group("Design the picture", `<p class="note">The picture of your link is set to “${esc(IMAGE_LABELS[e.image])}”. Pick “${esc(IMAGE_LABELS.card)}” under Look to arrange your own.</p>`);
        refreshPreview();
        return;
      }
      const d = design();
      if (!d) {
        host.innerHTML = group("Design the picture",
          `<div class="emb-stage emb-standard">${embedSvg(standard(), ctxOf(), "st")}</div>
           <p class="note">${gate ? "This is the plain enter screen. Arrange your own to move things, add text, pictures and shapes, and to put a video behind them." : "This is the standard picture. It follows every update of dusk on its own and always shows your name, handle and bio. Arrange your own to move things, add text, pictures and shapes. Yours then stays exactly as you set it."}</p>
           <button class="btn-primary" type="button" data-emb-own style="justify-content:center">Arrange my own</button>`);
        refreshPreview();
        return;
      }
      host.innerHTML = group("Design the picture", `<div class="emb-tools">
          <span>Add</span>${ADD_ORDER.map(k => `<button type="button" class="seg-btn" data-ed-add="${k}"${d.boxes.length >= MAX_EMBED_BOXES ? " disabled" : ""}>${esc(KIND_LABEL[k])}</button>`).join("")}
          <button type="button" class="btn-ghost emb-reset" data-emb-standard>${gate ? "Back to the plain screen" : "Back to the standard picture"}</button>
        </div>
        <div class="emb-scale" data-emb-scale><div class="pboard-canvas emb-canvas" data-emb-canvas><video class="emb-vid" data-emb-vid muted loop playsinline autoplay aria-hidden="true"></video><div class="emb-art" data-emb-art></div></div></div>
        <div class="emb-opts" data-emb-opts></div>
        <div class="emb-bgwrap"><h4>Background</h4>${bgHTML()}</div>`);
      canvas = host.querySelector<HTMLElement>("[data-emb-canvas]");
      art = host.querySelector<HTMLElement>("[data-emb-art]");
      syncVideo();
      scaleBox = host.querySelector<HTMLElement>("[data-emb-scale]");
      optsEl = host.querySelector<HTMLElement>("[data-emb-opts]");
      if (!canvas) return;
      for (const b of d.boxes) {
        const card = document.createElement("div");
        card.className = `fbox ebox${isEmpty(b) ? " empty" : ""}${b.id === selected ? " sel" : ""}${b.locked ? " is-locked" : ""}`;
        card.dataset.widget = b.id;
        card.tabIndex = 0;
        card.setAttribute("aria-label", `${KIND_LABEL[kindOf(b)]}. Use the arrow keys to move it.`);
        card.innerHTML = `<span class="pbtag">${esc(KIND_LABEL[kindOf(b)])}</span>`;
        canvas.append(card);
        layout(b);
      }
      frame = document.createElement("div");
      frame.className = "pb-frame";
      frame.hidden = true;
      frame.innerHTML = HANDLES.map(h => `<span class="pbh" data-h="${h}" aria-hidden="true"></span>`).join("");
      canvas.append(frame);
      fitScale();
      drawArt();
      syncFrame();
      drawOpts();
      refreshPreview();

      const scrollParent = (): HTMLElement | null => {
        for (let n: HTMLElement | null = canvas?.parentElement ?? null; n; n = n.parentElement) {
          const o = getComputedStyle(n).overflowY;
          if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
        }
        return document.scrollingElement as HTMLElement | null;
      };
      detachMoves = attachMoves({
        canvas,
        scale: () => scale,
        width: () => EMBED_W,
        boxes: () => boxes() as unknown as BoardBox[],
        cardOf,
        scroller: scrollParent,
        tick: () => {
          const live = canvas?.querySelector<HTMLElement>(".fbox.dragging");
          drawArt(live ? { id: live.dataset.widget ?? "", x: live.offsetLeft, y: live.offsetTop, w: live.offsetWidth, h: live.offsetHeight } : undefined);
          syncFrame();
        },
        tap: id => select(selected === id ? null : id),
        commit: (box, changed) => {
          const b = box as unknown as EmbedBox;
          // The picture is only so big. A piece is kept on it.
          b.w = Math.max(8, Math.min(EMBED_W, b.w));
          b.h = Math.max(8, Math.min(EMBED_H, b.h));
          b.x = Math.max(0, Math.min(EMBED_W - 8, b.x));
          b.y = Math.max(0, Math.min(EMBED_H - 8, b.y));
          b.fixedH = true;
          layout(b);
          drawArt();
          syncFrame();
          if (changed) { save(); drawOpts(); refreshPreview(); }
        },
      });
    }

    /* ----- what is done in the page ----- */
    const apply = (field: string, value: unknown): void => {
      const d = design();
      if (!d) return;
      if (field.startsWith("bg.")) {
        (d.bg as unknown as Record<string, unknown>)[field.slice(3)] = value;
        return;
      }
      const b = picked();
      if (!b) return;
      const rec = b as unknown as Record<string, unknown>;
      if (value === "" || value === undefined) delete rec[field]; else rec[field] = value;
    };
    const changed = (redrawOpts = false): void => {
      save();
      drawArt();
      refreshPreview();
      if (redrawOpts) drawOpts();
    };

    draw();
    const resize = new ResizeObserver(() => { fitScale(); syncFrame(); });
    resize.observe(el);
    cleanups.push(() => resize.disconnect());

    cleanups.push(
      // The words, the look and the picture choice.
      bindFields(el, path => path === "embed.image" || path === "page.enter", draw),
      delegate(el, "input", "[data-p]", refreshPreview),
      delegate(el, "change", "[data-p]", refreshPreview),
      delegate(el, "click", "[data-emb-reset-color]", () => { store.profile.embed.color = ""; save(); draw(); }),

      // The standard picture, or one of their own.
      delegate(el, "click", "[data-emb-own]", () => { setDesign(structuredClone(standard())); selected = null; save(); draw(); }),
      delegate(el, "click", "[data-emb-standard]", () => {
        if (!window.confirm(gate ? "Go back to the plain enter screen? Your arrangement is lost." : "Go back to the standard picture? Your arrangement is lost. The standard one follows every update on its own.")) return;
        setDesign(null);
        selected = null;
        save();
        draw();
      }),

      // The pieces.
      delegate(el, "click", "[data-ed-add]", (_e, t) => add((t.dataset.edAdd ?? "text") as EmbedKind)),
      delegate(el, "click", "[data-ed-act]", (_e, t) => {
        if (!selected) return;
        const act = t.dataset.edAct;
        if (act === "del") remove(selected);
        else if (act === "dup") duplicate(selected);
        else if (act === "forward") reorder(selected, 1);
        else if (act === "back") reorder(selected, -1);
      }),
      delegate(el, "click", "[data-ed-set]", (_e, t) => {
        const [field, ...rest] = (t.dataset.edSet ?? "").split(":");
        const value = rest.join(":");
        if (!field) return;
        apply(field, field === "wt" ? Number(value) : value);
        changed(true);
        if (field === "bg.mode" || field === "bg.src") drawDesigner();
        if (field === "src" || field === "shape" || field === "color") canvas?.querySelectorAll<HTMLElement>(".ebox").forEach(c => { const b = boxes().find(x => x.id === c.dataset.widget); if (b) c.classList.toggle("empty", isEmpty(b)); });
      }),
      delegate(el, "input", "[data-ed-str]", (_e, t) => {
        const field = (t as HTMLElement).dataset.edStr ?? "";
        const value = (t as HTMLInputElement).value.trim();
        // A video address is only kept once it is a real one; it is checked again when saved.
        if (field === "bg.video") {
          const ok = value === "" || /^(\/media\/file\/[\w-]+\/m-[a-f0-9]{16}\.(mp4|webm|ogg)|https:\/\/\S+\.(mp4|webm|ogg)(\?\S*)?)$/i.test(value);
          if (!ok) return;
          apply(field, value);
          syncVideo();
          changed();
          return;
        }
        apply(field, (t as HTMLInputElement).value);
        const b = picked();
        if (b) cardOf(b.id)?.classList.toggle("empty", isEmpty(b));
        changed();
      }),
      delegate(el, "input", "[data-ed-num]", (_e, t) => {
        const input = t as HTMLInputElement;
        const field = input.dataset.edNum ?? "";
        apply(field, Number(input.value));
        const em = input.closest(".fld")?.querySelector("em");
        if (em) em.textContent = `${input.value}${input.dataset.unit ?? ""}`;
        changed();
      }),
      delegate(el, "input", "[data-ed-col]", (_e, t) => { apply((t as HTMLElement).dataset.edCol ?? "", (t as HTMLInputElement).value); changed(); }),
      delegate(el, "change", "[data-ed-flag]", (_e, t) => {
        const input = t as HTMLInputElement;
        const field = input.dataset.edFlag ?? "";
        apply(field, input.checked ? true : field === "bg.glow" ? false : "");
        changed();
        if (field === "locked") { canvas?.querySelector(`.fbox[data-widget="${selected}"]`)?.classList.toggle("is-locked", input.checked); syncFrame(); }
      }),
      delegate(el, "change", "[data-ed-pos]", (_e, t) => {
        const b = picked();
        if (!b) return;
        const input = t as HTMLInputElement;
        const f = input.dataset.edPos as "x" | "y" | "w" | "h";
        const v = Math.round(Number(input.value));
        if (!Number.isFinite(v)) return;
        b[f] = f === "w" ? Math.max(8, Math.min(EMBED_W, v)) : f === "h" ? Math.max(8, Math.min(EMBED_H, v)) : f === "x" ? Math.max(0, Math.min(EMBED_W - 8, v)) : Math.max(0, Math.min(EMBED_H - 8, v));
        layout(b);
        syncFrame();
        changed(true);
      }),
      delegate(el, "click", "[data-ed-pick]", async () => {
        const b = picked();
        const r = await chooseMedia();
        if (!b || !r || r.video) return;
        b.src = "media";
        b.url = r.url;
        changed(true);
        cardOf(b.id)?.classList.toggle("empty", isEmpty(b));
      }),
      delegate(el, "click", "[data-ed-pickvideo]", async () => {
        const d = design();
        const r = await chooseMedia();
        if (!d || !r) return;
        if (!r.video) { window.alert("Choose a video file (MP4 or WebM)."); return; }
        d.bg.video = r.url;
        changed();
        drawDesigner();
      }),
      delegate(el, "click", "[data-ed-clearvideo]", () => {
        const d = design();
        if (!d) return;
        d.bg.video = "";
        changed();
        drawDesigner();
      }),
      delegate(el, "click", "[data-emb-fresh]", (_e, t) => {
        const link = `${location.origin}/${encodeURIComponent(store.me?.user.username ?? "")}?e=${Date.now().toString(36)}`;
        void navigator.clipboard.writeText(link).then(() => { t.textContent = "Copied"; window.setTimeout(() => { t.textContent = "Copy a fresh link"; }, 1600); }).catch(() => { t.textContent = link; });
      }),
      delegate(el, "click", "[data-ed-pickbg]", async () => {
        const d = design();
        const r = await chooseMedia();
        if (!d || !r || r.video) return;
        d.bg.url = r.url;
        d.bg.src = "media";
        changed();
        drawDesigner();
      }),

      // Keys on a piece: the arrows nudge it, Delete removes it.
      delegate(el, "keydown", ".ebox", (e, t) => {
        const ev = e as KeyboardEvent;
        const b = boxes().find(x => x.id === t.dataset.widget);
        if (!b) return;
        if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); remove(b.id); return; }
        const step = ev.shiftKey ? GRID * 4 : GRID;
        const dx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
        const dy = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
        if (!dx && !dy) return;
        ev.preventDefault();
        if (b.locked) return;
        b.x = Math.max(0, Math.min(EMBED_W - 8, b.x + dx));
        b.y = Math.max(0, Math.min(EMBED_H - 8, b.y + dy));
        layout(b);
        syncFrame();
        changed(true);
      }),
      // Pressing on the picture itself, away from every piece, puts the pieces down.
      delegate(el, "click", "[data-emb-canvas]", (e, t) => { if (e.target === t || (e.target as HTMLElement).closest("[data-emb-art]")) select(null); }),
    );

    return () => {
      detachMoves?.();
      cleanups.forEach(fn => fn());
    };
  }
}
