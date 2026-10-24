import type { Lyrics, Track } from "../../../shared/types";
import { LIMITS, LYRIC_PROVIDER_NAMES } from "../../../shared/constants";
import { api } from "../../api";
import { store } from "../../state";
import { icon } from "../../ui/icons";
import { toast } from "../../ui/toast";
import { delegate, esc, must } from "../../util/dom";
import { fmtTime } from "../../util/format";
import { bindFields, choiceGrid, group, LYRIC_CHOICES, rangeField, toggle, type Pane } from "./fields";

const LYRIC_CHIP: Record<Lyrics["status"], string> = {
  synced: "Synced lyrics", plain: "Lyrics, not synced", none: "No lyrics found", instrumental: "Instrumental",
};
const mb = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)} MB`;

function trackHTML(t: Track, i: number, count: number, editing: boolean): string {
  const cover = t.coverUrl ? `<img class="track-cover" src="${esc(t.coverUrl)}" alt="">` : `<span class="track-cover">${icon("music")}</span>`;
  const cs = t.lyrics.status;
  // The service the words came from, when it is known.
  const source = t.lyrics.source ? ` · ${LYRIC_PROVIDER_NAMES[t.lyrics.source]}` : "";
  // A song whose file is not on the server cannot play, so it is said so here too.
  const gone = !t.available ? `<span class="chip-s none">File missing</span>` : "";
  return `<div class="track-item" data-id="${esc(t.id)}">
    ${cover}
    <div class="track-meta"><b>${esc(t.title)}</b><span>${esc(t.artist)} · ${fmtTime(t.duration * 1000)}</span><span class="chip-s ${cs}">${LYRIC_CHIP[cs]}${source}</span>${gone}</div>
    <div class="track-tools">
      <button class="icon-btn" type="button" data-edit aria-label="Edit song" aria-expanded="${editing}">${icon("edit")}</button>
      <button class="icon-btn" type="button" data-move="-1" aria-label="Move up"${i === 0 ? " disabled" : ""}>${icon("up")}</button>
      <button class="icon-btn" type="button" data-move="1" aria-label="Move down"${i === count - 1 ? " disabled" : ""}>${icon("down")}</button>
      <button class="icon-btn del" type="button" data-del aria-label="Delete song">${icon("trash")}</button>
    </div>
    ${editing ? `<div class="track-edit">
      <div class="two">
        <label class="fld">Song name<input type="text" class="inp" data-title value="${esc(t.title)}" maxlength="120"></label>
        <label class="fld">Artist<input type="text" class="inp" data-artist value="${esc(t.artist)}" maxlength="120"></label>
      </div>
      <div class="two">
        <button class="btn-ghost" type="button" data-lookup style="justify-content:center">${icon("refresh")} Look up again</button>
        <label class="btn-ghost" style="justify-content:center;cursor:pointer">${icon("image")} Upload cover<input type="file" data-cover accept="image/png,image/jpeg,image/webp" hidden></label>
      </div>
      <p class="form-msg" data-msg role="status">Cover from ${t.coverSource === "embedded" ? "the MP3 itself" : t.coverSource === "itunes" ? "an iTunes search" : t.coverSource === "upload" ? "your upload" : "nowhere yet"}.</p>
    </div>` : ""}
  </div>`;
}

export const musicPane: Pane = {
  id: "music",
  label: "Music",
  hint: "Songs on your page, and the lyrics that follow them.",
  mount(el) {
    let file: File | null = null;
    let editing: string | null = null;
    let uploading = false;
    let message: { text: string; kind: "" | "err" | "ok" } = { text: "", kind: "" };
    const tracks = (): Track[] => store.me!.tracks;
    /** The lyrics service the owner picked in the settings. */
    const service = (): string => LYRIC_PROVIDER_NAMES[store.profile.page.lyricsProvider];

    const draw = (): void => {
      const p = store.profile;
      const list = tracks();
      el.innerHTML = [
        group("Add a song",
          `<form id="add" class="grp${uploading ? " busy" : ""}">
            <label class="drop${file ? " has-file" : ""}" id="drop">${icon("upload")}
              ${file ? `<strong>${esc(file.name)}</strong><span>${mb(file.size)} · click to choose a different file</span>` : `<strong>Choose an MP3</strong><span>or drop it here · up to ${mb(LIMITS.audioBytes)}</span>`}
              <input type="file" id="file" accept="audio/mpeg,.mp3" hidden></label>
            <div class="two">
              <label class="fld">Song name<input type="text" class="inp" id="title" maxlength="120" autocomplete="off"></label>
              <label class="fld">Artist<input type="text" class="inp" id="artist" maxlength="120" autocomplete="off"></label>
            </div>
            <button class="btn-primary" type="submit"${list.length >= LIMITS.tracks ? " disabled" : ""}>${uploading ? "Uploading and finding lyrics…" : "Add song"}</button>
            <p class="form-msg ${message.kind}" role="status">${esc(message.text) || (list.length >= LIMITS.tracks ? `You can add up to ${LIMITS.tracks} songs.` : `Lyrics come from ${service()}. The cover comes from the MP3, or from an iTunes search if it has none.`)}</p>
          </form>`),
        group(`Your songs${list.length ? ` (${list.length})` : ""}`,
          list.length ? `<div class="track-list">${list.map((t, i) => trackHTML(t, i, list.length, editing === t.id)).join("")}</div>` : `<p class="note">No songs yet. Songs play on your page in this order.</p>`),
        group("Player",
          toggle("music.enabled", "Play my songs on my page", p.music.enabled) +
          toggle("music.autoplay", "Start playing when someone enters", p.music.autoplay) +
          toggle("music.loop", "Loop the list", p.music.loop) +
          toggle("music.showProgress", "Show the progress bar", p.music.showProgress) +
          toggle("music.showLyrics", "Show the lyrics line", p.music.showLyrics) +
          choiceGrid("music.lyricsStyle", "Lyrics style", p.music.lyricsStyle, LYRIC_CHOICES, store.me!.vip, { cols: 2 }) +
          toggle("music.lyricsOpen", "Open the lyrics by default", p.music.lyricsOpen) +
          rangeField("music.volume", "Volume", p.music.volume, 0, 1, 0.05)),
      ].join("");
    };
    draw();

    const say = (text: string, kind: "" | "err" | "ok" = ""): void => { message = { text, kind }; draw(); };
    const setFile = (f: File | undefined): void => {
      if (!f) return;
      if (!/\.mp3$/i.test(f.name) && f.type !== "audio/mpeg") { say("That isn't an MP3 file.", "err"); return; }
      if (f.size > LIMITS.audioBytes) { say(`That file is over ${mb(LIMITS.audioBytes)}.`, "err"); return; }
      const t = el.querySelector<HTMLInputElement>("#title")?.value ?? "";
      const a = el.querySelector<HTMLInputElement>("#artist")?.value ?? "";
      file = f;
      message = { text: "", kind: "" };
      draw();
      must<HTMLInputElement>("#title", el).value = t;
      must<HTMLInputElement>("#artist", el).value = a;
    };
    const replace = (t: Track): void => {
      const me = store.me!;
      store.setMe({ ...me, tracks: me.tracks.map(x => (x.id === t.id ? t : x)) });
    };
    const rowOf = (t: HTMLElement): HTMLElement => t.closest<HTMLElement>("[data-id]")!;
    const msgOf = (t: HTMLElement): HTMLElement | null => rowOf(t).querySelector("[data-msg]");

    const offs = [
      bindFields(el),
      delegate(el, "change", "#file", (_e, t) => setFile((t as HTMLInputElement).files?.[0])),
      delegate(el, "dragover", "#drop", (e, t) => { e.preventDefault(); t.classList.add("over"); }),
      delegate(el, "dragleave", "#drop", (_e, t) => t.classList.remove("over")),
      delegate(el, "drop", "#drop", (e, t) => { e.preventDefault(); t.classList.remove("over"); setFile((e as DragEvent).dataTransfer?.files[0]); }),
      delegate(el, "submit", "#add", async e => {
        e.preventDefault();
        if (uploading) return;
        if (!file) { say("Choose an MP3 first.", "err"); return; }
        const title = must<HTMLInputElement>("#title", el).value.trim();
        const artist = must<HTMLInputElement>("#artist", el).value.trim();
        if (!title || !artist) { say("Enter the song name and the artist.", "err"); return; }
        uploading = true;
        draw();
        must<HTMLInputElement>("#title", el).value = title;
        must<HTMLInputElement>("#artist", el).value = artist;
        try {
          const track = await api.addTrack(file, title, artist);
          const me = store.me!;
          store.setMe({ ...me, tracks: [...me.tracks, track] });
          file = null;
          uploading = false;
          say(track.lyrics.status === "synced" ? "Added with synced lyrics." : track.lyrics.status === "none" ? `Added. ${service()} had no lyrics for this one. Try editing the name or artist.` : "Added.", "ok");
        } catch (err) {
          uploading = false;
          say(err instanceof Error ? err.message : "Upload failed.", "err");
          must<HTMLInputElement>("#title", el).value = title;
          must<HTMLInputElement>("#artist", el).value = artist;
        }
      }),
      delegate(el, "click", "[data-edit]", (_e, t) => { const id = rowOf(t).dataset.id!; editing = editing === id ? null : id; draw(); }),
      delegate(el, "click", "[data-del]", async (_e, t) => {
        const id = rowOf(t).dataset.id!;
        const track = tracks().find(x => x.id === id);
        if (!track || !confirm(`Delete "${track.title}"?`)) return;
        try {
          await api.deleteTrack(id);
          store.setMe({ ...store.me!, tracks: tracks().filter(x => x.id !== id) });
          draw();
        } catch (err) { toast(err instanceof Error ? err.message : "Couldn't delete it."); }
      }),
      delegate(el, "click", "[data-move]", async (_e, t) => {
        const list = [...tracks()];
        const i = list.findIndex(x => x.id === rowOf(t).dataset.id);
        const j = i + Number(t.dataset.move);
        const a = list[i];
        const b = list[j];
        if (!a || !b) return;
        list[i] = b;
        list[j] = a;
        store.setMe({ ...store.me!, tracks: list });
        draw();
        try { await api.orderTracks(list.map(x => x.id)); } catch (err) { toast(err instanceof Error ? err.message : "Couldn't save the order."); }
      }),
      delegate(el, "click", "[data-lookup]", async (_e, t) => {
        const row = rowOf(t);
        const title = must<HTMLInputElement>("[data-title]", row).value.trim();
        const artist = must<HTMLInputElement>("[data-artist]", row).value.trim();
        const msg = msgOf(t);
        if (msg) { msg.textContent = "Looking up lyrics…"; msg.className = "form-msg"; }
        try {
          replace(await api.lookupTrack(row.dataset.id!, title, artist));
          draw();
          toast("Lyrics updated");
        } catch (err) {
          if (msg) { msg.textContent = err instanceof Error ? err.message : "Lookup failed."; msg.className = "form-msg err"; }
        }
      }),
      delegate(el, "change", "[data-cover]", async (_e, t) => {
        const f = (t as HTMLInputElement).files?.[0];
        if (!f) return;
        try { replace(await api.uploadCover(rowOf(t).dataset.id!, f)); draw(); toast("Cover updated"); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed."); }
      }),
    ];
    return () => offs.forEach(fn => fn());
  },
};
