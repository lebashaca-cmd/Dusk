import { BRANDS, type BrandName } from "../../shared/brands";

const FILL = 'fill="currentColor" stroke="none"';

/** Inner SVG markup for every icon, on a 24x24 grid. Outline icons are drawn with strokes. */
const PATHS = {
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.3 3 3.3 15 0 18M12 3c-3.3 3-3.3 15 0 18"/>',
  music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="M10 9.5v5l4.5-2.5z"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  chat: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  gamepad: '<path d="M7 8h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5 2l-1-1H9l-1 1a3 3 0 0 1-5-2v-2a4 4 0 0 1 4-4z"/><path d="M8 11v3M6.5 12.5h3M16 12h.01M18 13.5h.01"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6"/>',
  arrow: '<path d="M7 17L17 7M9 7h8v8"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  upload: '<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  edit: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4M4 5v4h4M4 13a8 8 0 0 0 14 4M20 19v-4h-4"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
  chart: '<path d="M3 20.5h18"/><rect x="5" y="11" width="3.6" height="7"/><rect x="10.2" y="5" width="3.6" height="13"/><rect x="15.4" y="14" width="3.6" height="4"/>',
  playFill: `<path ${FILL} d="M8 5v14l11-7z"/>`,
  pauseFill: `<path ${FILL} d="M7 5h4v14H7zM13 5h4v14h-4z"/>`,
  prevFill: `<path ${FILL} d="M6 5h2v14H6zM20 5v14L9 12z"/>`,
  nextFill: `<path ${FILL} d="M16 5h2v14h-2zM4 5l11 7L4 19z"/>`,
} as const;

export type IconKey = keyof typeof PATHS;

export function icon(name: IconKey | string, cls = ""): string {
  const brand = (BRANDS as Record<string, { path: string } | undefined>)[name];
  const inner = brand ? `<path ${FILL} d="${brand.path}"/>` : ((PATHS as Record<string, string>)[name] ?? PATHS.link);
  return `<span class="ic${cls ? " " + cls : ""}"><svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg></span>`;
}

export type { BrandName };
