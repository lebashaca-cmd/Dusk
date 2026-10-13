import { PRESENCE_COLORS } from "../../shared/constants";
import type { PresenceData } from "../media/lanyard";
import { icon } from "../ui/icons";
import { esc } from "../util/dom";

const STATUS_LABEL = { online: "Online", idle: "Idle", dnd: "Do not disturb", offline: "Offline" } as const;

/** The Discord card: avatar, name, status or custom status, and the game or app in use. */
export function presenceCardHTML(d: PresenceData, showActivity: boolean): string {
  const status = d.custom?.text ? `${esc(d.custom.emoji)} ${esc(d.custom.text)}`.trim() : STATUS_LABEL[d.status];
  const face = d.avatar
    ? `<img src="${esc(d.avatar)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="pc-let">${esc((d.name || "?").charAt(0).toUpperCase())}</span>`;
  const game = showActivity && d.game
    ? `<div class="pc-act"><b>Playing ${esc(d.game.name)}</b>${d.game.details ? `<br>${esc(d.game.details)}` : ""}${d.game.state ? ` · ${esc(d.game.state)}` : ""}</div>`
    : "";
  return `<div class="pres-card">
    <div class="pc-row">
      <div class="pc-av">${face}<span class="pc-dot" style="background:${PRESENCE_COLORS[d.status]}"></span></div>
      <div class="pc-t"><b>${esc(d.name)}<small>@${esc(d.username)}</small></b><span>${status}</span></div>
      ${icon("chat", "pc-ic")}
    </div>${game}
  </div>`;
}
