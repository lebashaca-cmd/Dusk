import type { Insights } from "../../../shared/types";
import { api } from "../../api";
import { esc } from "../../util/dom";
import { group, type Pane } from "./fields";

/** How the page has been doing: views per day, and which links people open. */
export const insightsPane: Pane = {
  id: "insights",
  label: "Insights",
  hint: "How many people have looked at your page, and which links they open.",
  vip: true,
  mount(el) {
    el.innerHTML = `<p class="note">Loading…</p>`;
    let dead = false;

    const draw = (data: Insights): void => {
      const peak = Math.max(1, ...data.days.map(d => d.count));
      const week = data.days.slice(-7).reduce((sum, d) => sum + d.count, 0);
      // With no views at all there is no best day, so keep the day out of the sentence.
      const busiest = data.views
        ? data.days.reduce((best, d) => (d.count > best.count ? d : best), data.days[0] ?? { day: "", count: 0 })
        : { day: "", count: 0 };
      const bars = data.days.map(d =>
        `<i style="--h:${d.count ? Math.max(4, Math.round((d.count / peak) * 100)) : 1}%" title="${esc(d.day)}: ${d.count} views"></i>`).join("");
      const chart = data.views
        ? `<div class="chart" role="img" aria-label="Views per day for the last 30 days">${bars}</div>`
        : `<div class="chart empty">No views yet. Share your page and the days will fill in here.</div>`;
      const top = data.clicks.slice(0, 8);
      const busiestLink = Math.max(1, ...top.map(c => c.count));
      const rows = top.map(c =>
        `<div class="bar-row"><span class="bar-label">${esc(c.label)}</span><span class="bar"><i style="--w:${Math.max(4, Math.round((c.count / busiestLink) * 100))}%"></i></span><b>${c.count}</b></div>`).join("");

      el.innerHTML = group("Views",
        `<div class="figures">
          <div><b class="figure">${data.views.toLocaleString("en-US")}</b><span>in total</span></div>
          <div><b class="figure">${week.toLocaleString("en-US")}</b><span>in 7 days</span></div>
          <div><b class="figure">${busiest?.count ?? 0}</b><span>on a best day</span></div>
        </div>
        ${chart}
        <p class="note">The last 30 days, oldest first.${busiest?.day ? ` The best day was ${esc(busiest.day)}.` : ""}</p>`) +
        group("Links",
          rows
            ? `${rows}<p class="note">${data.clicksTotal.toLocaleString("en-US")} opens in total.</p>`
            : `<p class="note">No link has been opened yet. Share your page and the numbers will show up here.</p>`);
    };

    api.insights().then(data => { if (!dead) draw(data); }).catch(() => {
      if (!dead) el.innerHTML = `<p class="note">Your numbers could not be loaded. Try again in a moment.</p>`;
    });

    return () => { dead = true; };
  },
};
