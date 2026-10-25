import { api } from "../api";
import { esc } from "../util/dom";
import { icon } from "./icons";

type Mode = "signup" | "login";

/** Where "Log in with Discord" goes, remembering the name the person typed so Discord signs them up with it. */
const discordHref = (claim: string): string => (claim ? `/auth/discord?claim=${encodeURIComponent(claim)}` : "/auth/discord");

let open: { close: () => void } | null = null;

/**
 * The sign-in box. It sits over whatever page is open: email, username and password to make
 * an account, "Or log in with Discord" under it, and a small link at the bottom that turns the
 * box into the log-in form (and back).
 */
export function openLogin(opts: { mode?: Mode; username?: string; note?: string } = {}): void {
  open?.close();
  let mode: Mode = opts.mode ?? "signup";
  let claim = opts.username ?? "";
  let busy = false;
  const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const wrap = document.createElement("div");
  wrap.className = "lg-back";
  wrap.innerHTML = `<div class="lg-box" role="dialog" aria-modal="true" aria-labelledby="lg-title"></div>`;
  const box = wrap.firstElementChild as HTMLElement;
  document.body.append(wrap);
  document.body.classList.add("lg-open");

  const field = (id: string, label: string, type: string, extra = ""): string =>
    `<label class="lg-field" for="${id}"><span>${label}</span><input id="${id}" name="${id}" type="${type}" ${extra}></label>`;

  const draw = (message = "", kind: "" | "err" = ""): void => {
    const signup = mode === "signup";
    box.innerHTML = `
      <button class="lg-x" type="button" data-lg-close aria-label="Close">${icon("close")}</button>
      <h2 id="lg-title">${signup ? "Create your account" : "Welcome back"}</h2>
      <p class="lg-sub">${signup ? "Make a page in a minute. No Discord needed." : "Log in to your page."}</p>
      <form class="lg-form" id="lg-form" novalidate>
        ${signup
          ? field("lg-email", "Email", "email", 'autocomplete="email" inputmode="email" maxlength="254" spellcheck="false" autocapitalize="none"')
            + field("lg-user", "Username", "text", `autocomplete="username" maxlength="20" spellcheck="false" autocapitalize="none" value="${esc(claim)}"`)
            + field("lg-pass", "Password", "password", 'autocomplete="new-password" minlength="8" maxlength="200"')
          : field("lg-who", "Email or username", "text", 'autocomplete="username" maxlength="254" spellcheck="false" autocapitalize="none"')
            + field("lg-pass", "Password", "password", 'autocomplete="current-password" maxlength="200"')}
        <p class="lg-msg ${kind}" id="lg-msg" role="${kind ? "alert" : "status"}">${esc(message || opts.note || "")}</p>
        <button class="btn-primary lg-go" type="submit">${signup ? "Sign up" : "Log in"}</button>
      </form>
      <div class="lg-or" aria-hidden="true"><span>Or</span></div>
      <a class="lg-discord" id="lg-discord" href="${esc(discordHref(signup ? claim : ""))}">${icon("discord")}<span>Log in with Discord</span></a>
      <p class="lg-switch">${signup
        ? `Already have an account? <button type="button" data-lg-mode="login">Log in</button>`
        : `New here? <button type="button" data-lg-mode="signup">Sign up</button>`}</p>`;
    const first = box.querySelector<HTMLInputElement>(signup ? (claim ? "#lg-email" : "#lg-email") : "#lg-who");
    first?.focus();
  };

  const say = (text: string, kind: "" | "err" = ""): void => {
    const m = box.querySelector<HTMLElement>("#lg-msg");
    if (!m) return;
    m.textContent = text;
    m.className = `lg-msg ${kind}`;
    m.setAttribute("role", kind ? "alert" : "status");
  };

  const close = (): void => {
    document.removeEventListener("keydown", onKey);
    wrap.remove();
    document.body.classList.remove("lg-open");
    open = null;
    returnTo?.focus?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") { close(); return; }
    if (e.key !== "Tab") return;
    // Keep the focus inside the box while it is open.
    const items = [...box.querySelectorAll<HTMLElement>("button, a[href], input")].filter(el => !el.hasAttribute("disabled"));
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", onKey);

  wrap.addEventListener("mousedown", e => { if (e.target === wrap) close(); });
  box.addEventListener("input", e => {
    // The name typed here goes to Discord too, if they choose that instead.
    if ((e.target as HTMLElement).id === "lg-user") {
      claim = (e.target as HTMLInputElement).value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
      const a = box.querySelector<HTMLAnchorElement>("#lg-discord");
      if (a) a.href = discordHref(claim);
    }
  });
  box.addEventListener("click", e => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest("[data-lg-close]")) { close(); return; }
    const m = t?.closest<HTMLElement>("[data-lg-mode]");
    if (m) {
      const user = box.querySelector<HTMLInputElement>("#lg-user")?.value;
      if (user !== undefined) claim = user;
      mode = m.dataset.lgMode === "login" ? "login" : "signup";
      draw();
    }
  });
  box.addEventListener("submit", e => {
    e.preventDefault();
    if (busy) return;
    const val = (id: string): string => box.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
    let call: Promise<unknown>;
    if (mode === "signup") {
      const email = val("lg-email").trim();
      const username = val("lg-user").trim();
      const password = val("lg-pass");
      if (!email || !username || !password) { say("Fill in all three boxes.", "err"); return; }
      if (password.length < 8) { say("Use a password of at least 8 characters.", "err"); return; }
      call = api.register(email, username, password);
    } else {
      const who = val("lg-who").trim();
      const password = val("lg-pass");
      if (!who || !password) { say("Enter your email or username, and your password.", "err"); return; }
      call = api.login(who, password);
    }
    busy = true;
    const go = box.querySelector<HTMLButtonElement>(".lg-go");
    if (go) { go.disabled = true; go.textContent = mode === "signup" ? "Creating…" : "Logging in…"; }
    call.then(() => { location.href = "/dashboard"; }).catch((err: unknown) => {
      busy = false;
      if (go) { go.disabled = false; go.textContent = mode === "signup" ? "Sign up" : "Log in"; }
      say(err instanceof Error ? err.message : "Something went wrong. Try again.", "err");
    });
  });

  draw();
  open = { close };
}

/**
 * Any link or button marked `data-login` opens the box instead of going straight to Discord.
 * The link still points at Discord, so it keeps working if scripts have not loaded.
 */
export function wireLoginLinks(): void {
  document.addEventListener("click", e => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-login]") : null;
    if (!t || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    openLogin({ mode: t.dataset.login === "login" ? "login" : "signup" });
  });
}
