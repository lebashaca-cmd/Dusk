import { AVATAR_KINDS, AVATAR_SHAPES } from "../../../shared/types";
import { LIMITS } from "../../../shared/constants";
import { api } from "../../api";
import { store } from "../../state";
import { toast } from "../../ui/toast";
import { delegate, must } from "../../util/dom";
import { areaField, bindFields, group, rangeField, selectField, textField, toggle, type Pane } from "./fields";

const AVATAR_LABEL: Record<(typeof AVATAR_KINDS)[number], string> = {
  discord: "My Discord picture", image: "Upload a picture", emoji: "Emoji", letter: "First letter",
};

/** Squares an image to 512px and returns it as a JPEG so uploads stay small. */
async function squareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(512, side);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/jpeg", 0.88));
}

export const profilePane: Pane = {
  id: "profile",
  label: "Profile",
  mount(el) {
    const draw = (): void => {
      const p = store.profile;
      const me = store.me!;
      el.innerHTML = [
        group("About you",
          textField("name", "Display name", p.name, { max: 32 }) +
          areaField("bio", "Bio (one line per phrase)", p.bio, { max: LIMITS.bio, placeholder: "Write something about yourself" }) +
          toggle("typewriter", "Type the bio line by line", p.typewriter) +
          textField("location", "Location", p.location, { max: 40 }) +
          toggle("showLocation", "Show location", p.showLocation)),
        group("Picture",
          selectField("avatar.kind", "Picture", p.avatar.kind, AVATAR_KINDS.map(k => [k, AVATAR_LABEL[k]] as const)) +
          (p.avatar.kind === "emoji" ? textField("avatar.emoji", "Emoji", p.avatar.emoji, { max: 4 }) : "") +
          (p.avatar.kind === "image"
            ? `<div class="two"><label class="btn-ghost" style="justify-content:center;cursor:pointer">Choose file<input type="file" id="avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
               <button class="btn-ghost" type="button" id="avatar-clear" style="justify-content:center"${me.avatarUrl ? "" : " disabled"}>Remove</button></div>
               <p class="note">${me.avatarUrl ? "Using your uploaded picture." : "No picture uploaded yet, so the first letter is shown."}</p>`
            : "") +
          `<div class="two">${selectField("avatar.shape", "Shape", p.avatar.shape, AVATAR_SHAPES.map(s => [s, s[0]!.toUpperCase() + s.slice(1)] as const))}
            ${rangeField("avatar.size", "Size", p.avatar.size, 64, 160, 2, "px")}</div>` +
          toggle("avatar.ring", "Ring around the picture", p.avatar.ring) +
          (p.avatar.ring ? rangeField("avatar.ringWidth", "Ring thickness", p.avatar.ringWidth, 1, 10, 1, "px") : "")),
        group("Username",
          `<form id="uname" class="tagrow"><input class="inp" id="uname-in" type="text" value="${me.user.username}" maxlength="20" spellcheck="false" aria-label="Username"><button class="btn-ghost" type="submit">Change</button></form>
           <p class="form-msg" id="uname-msg" role="status"></p>`),
      ].join("");
    };
    draw();

    const offs = [
      bindFields(el, path => path === "avatar.kind" || path === "avatar.ring", draw),
      delegate(el, "change", "#avatar-file", async (_e, t) => {
        const file = (t as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          store.setMe({ ...(await api.uploadAvatar(await squareJpeg(file))), profile: store.profile });
          toast("Picture updated");
          draw();
        } catch (e) { toast(e instanceof Error ? e.message : "Upload failed."); }
      }),
      delegate(el, "click", "#avatar-clear", async () => {
        try { store.setMe({ ...(await api.removeAvatar()), profile: store.profile }); draw(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't remove it."); }
      }),
      delegate(el, "submit", "#uname", async e => {
        e.preventDefault();
        const msg = must("#uname-msg", el);
        const name = must<HTMLInputElement>("#uname-in", el).value.trim().toLowerCase();
        try {
          const r = await api.saveUsername(name);
          store.setMe({ ...store.me!, user: { ...store.me!.user, username: r.username } });
          msg.textContent = `Saved. Your page is now /${r.username}`;
          msg.className = "form-msg ok";
        } catch (err) {
          msg.textContent = err instanceof Error ? err.message : "Couldn't change it.";
          msg.className = "form-msg err";
        }
      }),
    ];
    return () => offs.forEach(fn => fn());
  },
};
