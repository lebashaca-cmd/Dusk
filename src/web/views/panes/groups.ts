import { LIMITS, newId } from "../../../shared/constants";
import { store } from "../../state";
import { icon } from "../../ui/icons";
import { delegate, esc } from "../../util/dom";
import { bindFields, group, type Pane } from "./fields";

/**
 * The headings that group the links. Links that sit in no group come first on the page,
 * then each group in the order it is set here.
 */
export const groupsPane: Pane = {
  id: "groups",
  label: "Groups",
  hint: "Put your links under headings, like Work or Elsewhere.",
  mount(el) {
    const draw = (): void => {
      const p = store.profile;
      const groups = p.groups;
      const loose = p.links.filter(l => !l.group || !groups.some(g => g.id === l.group));

      const cards = groups.map((g, i) => {
        const members = p.links.filter(l => l.group === g.id);
        const membersHTML = members.length
          ? `<div class="members">${members.map(l => `<span class="member">${icon(l.icon)}${esc(l.label || l.url || "Link")}<button class="icon-btn x" type="button" data-unlink="${esc(l.id)}" aria-label="Take out of this group">${icon("close")}</button></span>`).join("")}</div>`
          : `<p class="note">Nothing in this group yet.</p>`;
        const picker = loose.length
          ? `<label class="fld">Put a link in here<select data-add-to="${esc(g.id)}"><option value="">Choose a link…</option>${loose.map(l => `<option value="${esc(l.id)}">${esc(l.label || l.url || "Link")}</option>`).join("")}</select></label>`
          : "";
        return `<div class="card-ed" data-g="${esc(g.id)}">
          <div class="row">
            <b class="sp">${esc(g.label.trim() || `Group ${i + 1}`)}</b>
            <button class="icon-btn" type="button" data-move="-1" aria-label="Move up"${i === 0 ? " disabled" : ""}>${icon("up")}</button>
            <button class="icon-btn" type="button" data-move="1" aria-label="Move down"${i === groups.length - 1 ? " disabled" : ""}>${icon("down")}</button>
            <button class="icon-btn del" type="button" data-del aria-label="Delete group">${icon("trash")}</button>
          </div>
          <label class="fld">Heading<input type="text" data-p="groups.${i}.label" data-t="text" value="${esc(g.label)}" maxlength="28" placeholder="Work"></label>
          ${membersHTML}
          ${picker}
        </div>`;
      }).join("");

      el.innerHTML = group("Headings",
        `<p class="note">A heading sits above a set of links. Links with no heading come first.</p>
         ${cards || `<p class="note">No groups yet. Add one below and drop your links into it.</p>`}
         <button class="btn-ghost" type="button" data-add style="justify-content:center"${groups.length >= LIMITS.groups ? " disabled" : ""}>+ Add a group</button>`) +
        group("Without a heading",
          loose.length
            ? `<div class="members">${loose.map(l => `<span class="member">${icon(l.icon)}${esc(l.label || l.url || "Link")}</span>`).join("")}</div>
               <p class="note">These show at the top of the page.</p>`
            : `<p class="note">Every link is in a group.</p>`);
    };
    draw();

    /** The position of the group card a button belongs to. */
    function pIndex(t: HTMLElement): number {
      const card = t.closest<HTMLElement>("[data-g]");
      if (!card) return -1;
      return store.profile.groups.findIndex(g => g.id === card.dataset.g);
    }

    const offs = [
      bindFields(el, undefined, draw),
      delegate(el, "click", "[data-add]", () => {
        if (store.profile.groups.length >= LIMITS.groups) return;
        store.profile.groups.push({ id: newId(), label: "" });
        store.profileChanged();
        draw();
      }),
      delegate(el, "click", "[data-del]", (_e, t) => {
        const i = pIndex(t);
        if (i < 0) return;
        const [gone] = store.profile.groups.splice(i, 1);
        // Links in a deleted group go back to the top of the page.
        if (gone) for (const l of store.profile.links) if (l.group === gone.id) delete l.group;
        store.profileChanged();
        draw();
      }),
      delegate(el, "click", "[data-move]", (_e, t) => {
        const i = pIndex(t);
        const j = i + Number(t.dataset.move);
        const gs = store.profile.groups;
        const a = gs[i];
        const b = gs[j];
        if (i < 0 || !a || !b) return;
        gs[i] = b;
        gs[j] = a;
        store.profileChanged();
        draw();
      }),
      delegate(el, "click", "[data-unlink]", (_e, t) => {
        const id = t.dataset.unlink;
        const l = store.profile.links.find(x => x.id === id);
        if (l) delete l.group;
        store.profileChanged();
        draw();
      }),
      delegate(el, "change", "[data-add-to]", (_e, t) => {
        const select = t as HTMLSelectElement;
        const groupId = select.dataset.addTo;
        const link = store.profile.links.find(l => l.id === select.value);
        if (!groupId || !link) return;
        link.group = groupId;
        store.profileChanged();
        draw();
      }),
    ];
    return () => offs.forEach(fn => fn());
  },
};
