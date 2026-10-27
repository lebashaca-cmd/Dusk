/**
 * What the pieces of the board do as the page is scrolled: the ones that arrive when they come into view,
 * and the ones that drift against the scroll. The rest of the motion is plain CSS.
 */
export function watchMotion(root: HTMLElement): () => void {
  const off: Array<() => void> = [];

  // A piece that arrives "when it is scrolled to" waits, unseen, until it is on the screen.
  const views = [...root.querySelectorAll<HTMLElement>('.fbox[data-on="view"]')];
  if (views.length) {
    if (typeof IntersectionObserver === "undefined") {
      views.forEach(v => v.classList.add("in"));
    } else {
      const io = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).classList.add("in");
          io.unobserve(e.target);
        }
      }, { threshold: 0.12 });
      views.forEach(v => io.observe(v));
      off.push(() => io.disconnect());
    }
  }

  // A piece with a drift is moved by a share of how far it is from the middle of the screen.
  const drifts = [...root.querySelectorAll<HTMLElement>(".fbox[data-par]")];
  if (drifts.length) {
    let raf = 0;
    const shown = new Map<HTMLElement, number>();
    const run = (): void => {
      raf = 0;
      const mid = window.innerHeight / 2;
      for (const el of drifts) {
        const par = Number(el.dataset.par) / 100;
        const free = el.closest<HTMLElement>(".free");
        const k = free && free.offsetWidth ? free.getBoundingClientRect().width / free.offsetWidth : 1;
        const was = shown.get(el) ?? 0;
        const r = el.getBoundingClientRect();
        // Where the piece would be without the drift, so the drift does not feed back into itself.
        const centre = r.top + r.height / 2 - was * k;
        const py = Math.max(-400, Math.min(400, -((centre - mid) / (k || 1)) * par));
        shown.set(el, py);
        el.style.setProperty("--py", `${py.toFixed(1)}px`);
      }
    };
    const queue = (): void => { if (!raf) raf = requestAnimationFrame(run); };
    root.addEventListener("scroll", queue, { capture: true, passive: true });
    window.addEventListener("resize", queue);
    queue();
    off.push(() => {
      cancelAnimationFrame(raf);
      root.removeEventListener("scroll", queue, true);
      window.removeEventListener("resize", queue);
    });
  }

  off.push(watchLists(root));
  return () => off.forEach(fn => fn());
}

/** The dots under a games or music list: one for each screenful of cards, the one you are on shown long. Pressing a dot slides there. */
export function watchLists(root: HTMLElement): () => void {
  const lists = [...root.querySelectorAll<HTMLElement>(".flist")];
  const off: Array<() => void> = [];
  for (const list of lists) {
    const track = list.querySelector<HTMLElement>(".flist-track");
    const dots = list.querySelector<HTMLElement>(".flist-dots");
    if (!track || !dots) continue;
    const pages = (): number => Math.max(1, Math.round(track.scrollWidth / Math.max(1, track.clientWidth)));
    const drawDots = (): void => {
      const n = pages();
      if (dots.children.length !== n) dots.innerHTML = Array.from({ length: n }, () => "<i></i>").join("");
      const at = Math.min(n - 1, Math.round(track.scrollLeft / Math.max(1, track.scrollWidth - track.clientWidth) * (n - 1) || 0));
      [...dots.children].forEach((d, i) => d.classList.toggle("on", i === at));
    };
    const onDot = (e: Event): void => {
      const i = [...dots.children].indexOf(e.target as Element);
      if (i < 0) return;
      const n = pages();
      track.scrollTo({ left: (track.scrollWidth - track.clientWidth) * (n > 1 ? i / (n - 1) : 0), behavior: "smooth" });
    };
    track.addEventListener("scroll", drawDots, { passive: true });
    dots.addEventListener("click", onDot);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(drawDots) : null;
    ro?.observe(track);
    drawDots();
    off.push(() => { track.removeEventListener("scroll", drawDots); dots.removeEventListener("click", onDot); ro?.disconnect(); });
  }
  return () => off.forEach(fn => fn());
}
