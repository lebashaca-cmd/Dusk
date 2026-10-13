import { TAG_STYLES } from "../../../shared/types";
import { api } from "../../api";
import { store } from "../../state";
import { toast } from "../../ui/toast";
import { delegate, esc } from "../../util/dom";
import { bindFields, group, selectField, type Pane } from "./fields";

export const rolesPane: Pane = {
  id: "roles",
  label: "Roles",
  mount(el) {
    const draw = (): void => {
      const me = store.me!;
      const p = store.profile;
      if (!me.guildEnabled) {
        el.innerHTML = group("Discord roles", `<p class="note">This site isn't tied to a Discord server yet, so there are no roles to show. The person running the site can set DISCORD_GUILD_ID, DISCORD_BOT_TOKEN and DISCORD_INVITE_URL (see the README).</p>`);
        return;
      }
      const rows = me.roles.map(r => `<label class="sw"><span class="role-name"><i class="role-dot" style="background:${esc(r.color)}"></i>${esc(r.name)}</span>
        <input type="checkbox" data-role="${esc(r.id)}"${p.hiddenRoles.includes(r.id) ? "" : " checked"}></label>`).join("");
      el.innerHTML = group("Your roles",
        `<p class="note">These are your roles in the Discord server. Pick which ones show on your page as tags. They update when you log in or press the button below.</p>
         ${rows || `<p class="note">You don't have any roles in the server yet.</p>`}
         <button class="btn-ghost" type="button" id="refresh" style="justify-content:center">Refresh from Discord</button>`) +
        group("Look", selectField("tagStyle", "Tag style", p.tagStyle, TAG_STYLES.map(s => [s, s[0]!.toUpperCase() + s.slice(1)] as const)));
    };
    draw();

    const offs = [
      bindFields(el),
      delegate(el, "change", "[data-role]", (_e, t) => {
        const id = t.dataset.role!;
        const hidden = store.profile.hiddenRoles.filter(x => x !== id);
        if (!(t as HTMLInputElement).checked) hidden.push(id);
        store.profile.hiddenRoles = hidden;
        store.profileChanged();
      }),
      delegate(el, "click", "#refresh", async () => {
        try {
          const fresh = await api.refreshRoles();
          store.setMe({ ...fresh, profile: store.profile });
          draw();
          toast("Roles updated");
        } catch (e) { toast(e instanceof Error ? e.message : "Couldn't refresh."); }
      }),
    ];
    return () => offs.forEach(fn => fn());
  },
};
