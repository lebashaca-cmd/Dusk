import { store } from "../../state";
import { bindFields, group, textField, toggle, type Pane } from "./fields";

export const extrasPane: Pane = {
  id: "page",
  label: "Page",
  mount(el) {
    const p = store.profile;
    el.innerHTML = group("Page",
      toggle("page.enter", "Show an enter screen first", p.page.enter) +
      textField("page.enterText", "Enter screen text", p.page.enterText, { max: 30 }) +
      `<p class="note">Browsers only start music after a tap, so the enter screen is what lets your song play right away.</p>` +
      toggle("page.views", "Show the view counter", p.page.views) +
      toggle("page.share", "Show a share button", p.page.share));
    return bindFields(el);
  },
};
