import { api } from "../api";
import { toast } from "./toast";

/** What the file picker offers: pictures and the videos a browser can play. */
export const MEDIA_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg";

/**
 * Let the person choose a picture or a video from their device and put it on the site.
 * Returns the address to use, or null if they chose nothing or it could not be uploaded.
 * It must be called from a click, because browsers only open the file picker for one.
 */
export function chooseMedia(): Promise<{ url: string; video: boolean } | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = MEDIA_ACCEPT;
    input.style.display = "none";
    let settled = false;
    const done = (v: { url: string; video: boolean } | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) { done(null); return; }
      toast(file.size > 4 * 1048576 ? "Uploading… bigger files take a moment." : "Uploading…");
      try {
        const r = await api.uploadMedia(file);
        toast("Uploaded");
        done(r);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Upload failed.");
        done(null);
      }
    });
    input.addEventListener("cancel", () => done(null));
    document.body.append(input);
    input.click();
  });
}
