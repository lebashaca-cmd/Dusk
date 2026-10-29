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

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The games and music lists. The dots under a list are one for each screenful of cards. Pressing a dot glides there
 * with an eased slide and the cards of the new screenful rise in one after the other. While the list moves, each
 * card leans and shrinks a little with its distance from the middle ("flow"), unless the piece asks for a plain
 * "slide" or for no motion at all.
 */
export function watchLists(root: HTMLElement): () => void {
  const lists = [...root.querySelectorAll<HTMLElement>(".flist")];
  const off: Array<() => void> = [];
  for (const list of lists) {
    const track = list.querySelector<HTMLElement>(".flist-track");
    const dots = list.querySelector<HTMLElement>(".flist-dots");
    if (!track || !dots) continue;
    const cards = [...track.querySelectorAll<HTMLElement>(".fcard")];
    const mode = list.dataset.motion ?? "flow";
    let raf = 0;
    let glide = 0;
    const reach = (): number => Math.max(0, track.scrollWidth - track.clientWidth);
    const pages = (): number => Math.max(1, Math.round(track.scrollWidth / Math.max(1, track.clientWidth)));

    const drawDots = (): void => {
      const n = pages();
      if (dots.children.length !== n) dots.innerHTML = Array.from({ length: n }, () => "<i></i>").join("");
      const at = Math.min(n - 1, Math.round(track.scrollLeft / Math.max(1, reach()) * (n - 1) || 0));
      [...dots.children].forEach((d, i) => d.classList.toggle("on", i === at));
    };
    /** How far each card is from the middle of the list, as -1 (left edge) to 1 (right edge). */
    const lean = (): void => {
      raf = 0;
      if (mode !== "flow") return;
      const half = Math.max(1, track.clientWidth / 2);
      const mid = track.scrollLeft + half;
      for (const c of cards) {
        const k = Math.max(-1.4, Math.min(1.4, (c.offsetLeft - track.offsetLeft + c.offsetWidth / 2 - mid) / half));
        c.style.setProperty("--k", k.toFixed(3));
        c.style.setProperty("--a", Math.abs(k).toFixed(3));
      }
    };
    const onScroll = (): void => { drawDots(); if (mode === "flow" && !raf) raf = requestAnimationFrame(lean); };

    /** Cards that have just arrived rise in turn. */
    const land = (): void => {
      if (mode === "none") return;
      const left = track.scrollLeft;
      const right = left + track.clientWidth;
      let n = 0;
      for (const c of cards) {
        const x = c.offsetLeft - track.offsetLeft;
        if (x + c.offsetWidth * 0.5 < left || x + c.offsetWidth * 0.5 > right) continue;
        c.style.setProperty("--i", String(n++));
        c.classList.remove("land");
        void c.offsetWidth;
        c.classList.add("land");
      }
    };
    const stop = (): void => { if (glide) { cancelAnimationFrame(glide); glide = 0; list.classList.remove("sliding"); } };
    const glideTo = (target: number): void => {
      stop();
      const from = track.scrollLeft;
      const to = Math.max(0, Math.min(reach(), target));
      if (mode === "none" || Math.abs(to - from) < 2) { track.scrollTo({ left: to, behavior: "auto" }); return; }
      const dur = Math.min(950, 460 + Math.abs(to - from) * 0.35);
      const t0 = performance.now();
      list.classList.add("sliding");
      const step = (now: number): void => {
        const t = Math.min(1, (now - t0) / dur);
        track.scrollLeft = from + (to - from) * ease(t);
        if (t < 1) glide = requestAnimationFrame(step);
        else { glide = 0; list.classList.remove("sliding"); land(); }
      };
      glide = requestAnimationFrame(step);
    };
    const onDot = (e: Event): void => {
      const i = [...dots.children].indexOf(e.target as Element);
      if (i < 0) return;
      const n = pages();
      // End on a card's left edge, which is where the list rests (it snaps there), so the slide never ends with a jump.
      const want = reach() * (n > 1 ? i / (n - 1) : 0);
      const edges = cards.map(c => c.offsetLeft - track.offsetLeft).filter(x => x <= reach() + 1);
      const rest = edges.reduce((best, x) => (Math.abs(x - want) < Math.abs(best - want) ? x : best), edges[0] ?? want);
      glideTo(i === n - 1 ? reach() : rest);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    // Taking hold of the list yourself stops a slide that is still going.
    for (const ev of ["wheel", "pointerdown", "touchstart"]) track.addEventListener(ev, stop, { passive: true });
    dots.addEventListener("click", onDot);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { drawDots(); lean(); }) : null;
    ro?.observe(track);
    drawDots();
    lean();
    off.push(() => {
      stop();
      cancelAnimationFrame(raf);
      track.removeEventListener("scroll", onScroll);
      for (const ev of ["wheel", "pointerdown", "touchstart"]) track.removeEventListener(ev, stop);
      dots.removeEventListener("click", onDot);
      ro?.disconnect();
    });
  }
  return () => off.forEach(fn => fn());
}
