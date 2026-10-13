let el: HTMLElement | null = null;
let timer: number | undefined;

/** A short message at the bottom of the screen. */
export function toast(message: string): void {
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove("show"), 2200);
}

export async function copyText(text: string, success: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(success);
  } catch {
    toast("Couldn't copy. Select it and copy by hand.");
  }
}
