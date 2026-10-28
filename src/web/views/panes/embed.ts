import { EMBED_IMAGES } from "../../../shared/types";
import { store } from "../../state";
import { delegate, esc } from "../../util/dom";
import { bindFields, group, selectField, textField, toggle, type Pane } from "./fields";

const IMAGE_LABELS: Record<(typeof EMBED_IMAGES)[number], string> = {
  card: "The card made for my page",
  avatar: "My profile picture",
  background: "My background picture",
  none: "No picture",
};

/** The same lines the server fills in when the link is shared. */
function fill(text: string): string {
  const p = store.profile;
  const vars: Record<string, string> = {
    name: p.name || store.me?.user.username || "",
    username: store.me?.user.username ?? "",
    views: String(store.me?.views ?? 0),
    links: String(p.links.length),
  };
  return text.replace(/\{(name|username|views|links)\}/g, (_m, k: string) => vars[k] ?? "");
}

/** The picture the preview shows, or null for none. A picture that is missing falls back to the card, as it does on the server. */
function pictureUrl(): string | null {
  const p = store.profile;
  const user = store.me?.user;
  const card = `/api/public/${encodeURIComponent(user?.username ?? "")}/card.png`;
  switch (p.embed.image) {
    case "none": return null;
    case "avatar": return store.me?.avatarUrl ?? user?.discordAvatarUrl ?? card;
    case "background": return store.me?.vip && p.bgImage && !/\.(mp4|webm|ogg)(\?|$)/i.test(p.bgImage) ? p.bgImage : card;
    default: return card;
  }
}

/** A drawing of how a link looks in Discord: the colour bar, the site, the title, the words and the picture. */
function previewHTML(): string {
  const p = store.profile;
  const e = p.embed;
  const name = p.name || store.me?.user.username || "you";
  const title = fill(e.title.trim()).trim() || `${name} · dusk`;
  const bio = p.bio.split("\n").map(l => l.trim()).filter(Boolean)[0] ?? "";
  const desc = fill(e.desc.trim()).trim() || (bio ? (bio.length > 160 ? `${bio.slice(0, 157)}…` : bio) : "A page on dusk.");
  const site = fill(e.site.trim()).trim() || "dusk";
  const color = e.color || p.colors.accent;
  const pic = pictureUrl();
  const img = pic ? `<img class="emb-img" src="${esc(pic)}" alt="">` : "";
  return `<div class="emb${pic && !e.large ? " small" : ""}" style="--emb:${esc(color)}">
    <div class="emb-body">
      <span class="emb-site">${esc(site)}</span>
      <b class="emb-title">${esc(title)}</b>
      <p class="emb-desc">${esc(desc)}</p>
      ${pic && e.large ? img : ""}
    </div>
    ${pic && !e.large ? img : ""}
  </div>`;
}

/** How a link to your page looks when it is posted in Discord and other apps. */
export const embedPane: Pane = {
  id: "embed",
  label: "Embed",
  hint: "How your link looks when someone posts it in Discord and other apps.",
  mount(el) {
    const draw = (): void => {
      const e = store.profile.embed;
      const address = `${location.origin}/${encodeURIComponent(store.me?.user.username ?? "")}`;
      el.innerHTML = [
        group("Preview", `<div class="emb-stage" data-emb-preview>${previewHTML()}</div>
          <p class="note">A drawing of the link ${esc(address)} in a Discord message. Discord keeps a link it has already seen for a while, so a change can take some time to show on one that was posted before.</p>`),
        group("Words",
          textField("embed.title", "Title", e.title, { max: 70, placeholder: `${store.profile.name || "Your name"} · dusk` }) +
          `<label class="fld">Description<textarea data-p="embed.desc" data-t="text" maxlength="200" placeholder="The first line of your bio">${esc(e.desc)}</textarea></label>` +
          textField("embed.site", "Small line above the title", e.site, { max: 40, placeholder: "dusk" }) +
          `<p class="note">Leave a box empty to use the default. You can write <code>{name}</code>, <code>{username}</code>, <code>{views}</code> or <code>{links}</code> and they are filled in for you.</p>`),
        group("Look",
          `<div class="emb-color"><label class="clr">Bar colour<input type="color" data-p="embed.color" data-t="color" value="${esc(e.color || store.profile.colors.accent)}"></label>
            <button class="btn-ghost" type="button" data-emb-reset-color${e.color ? "" : " disabled"}>Use my accent colour</button></div>` +
          selectField("embed.image", "Picture", e.image, EMBED_IMAGES.map(i => [i, IMAGE_LABELS[i]] as const)) +
          (e.image === "background" && !store.me?.vip ? `<p class="note">A picture background is for VIP members, so the card is shown instead.</p>` : "") +
          (e.image === "background" && store.me?.vip && !store.profile.bgImage ? `<p class="note">You have not set a picture background yet, so the card is shown instead.</p>` : "") +
          (e.image !== "none" ? toggle("embed.large", "Show the picture big, under the words", e.large) : "")),
      ].join("");
    };
    draw();
    const refresh = (): void => { const box = el.querySelector<HTMLElement>("[data-emb-preview]"); if (box) box.innerHTML = previewHTML(); };
    const offs = [
      // The picture choice changes which controls are shown, so it redraws. Typing only refreshes the drawing.
      bindFields(el, path => path === "embed.image", draw),
      delegate(el, "input", "[data-p]", refresh),
      delegate(el, "change", "[data-p]", refresh),
      delegate(el, "click", "[data-emb-reset-color]", () => {
        store.profile.embed.color = "";
        store.profileChanged();
        draw();
      }),
    ];
    return () => offs.forEach(fn => fn());
  },
};
