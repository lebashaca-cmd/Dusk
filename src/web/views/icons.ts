/** Small line icons for the dashboard rail. Each is the inside of a 24x24 stroked SVG. */
export const RAIL_ICONS: Record<string, string> = {
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  links: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  roles: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  style: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.6-1.2-1.8-1.2-3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.3 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.2" r="1"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  discord: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.5A8 8 0 1 1 21 12Z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  page: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><path d="M17.2 13.5v7.5M13.5 17.2H21"/>',
  groups: '<path d="M3 7h18M3 12h11M3 17h14"/><circle cx="18.5" cy="12" r="2.5"/>',
  insights: '<path d="M3 21h18M6.5 21v-7M12 21V5M17.5 21v-10"/>',
  embed: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 4v16" stroke-width="3.4"/><path d="M8 9h9M8 12.5h6"/><rect x="8" y="15" width="9" height="3" rx="1"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6"/>',
  board: '<rect x="3" y="3" width="7.5" height="9" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.6"/><rect x="3" y="15" width="7.5" height="6" rx="1.6"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.6"/>',
  pageboard: '<rect x="3" y="4" width="8" height="7" rx="1.6"/><rect x="13" y="4" width="8" height="7" rx="1.6"/><rect x="3" y="14" width="8" height="6" rx="1.6"/><path d="M13 15h8M13 18h5"/>',
};

export const railIcon = (id: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${RAIL_ICONS[id] ?? ""}</svg>`;
