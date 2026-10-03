/**
 * Hand-drawn UI icons (inline SVG), used instead of emoji so the interface
 * keeps one look on every platform. Each takes the text colour for its
 * outline (`currentColor`) and a fixed fill for its accent.
 */
const svg = (body: string, view = '0 0 24 24') =>
  `<svg class="icon" viewBox="${view}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  timer: svg('<circle cx="12" cy="13" r="8" fill="#fff7e6"/><path d="M12 9v4l2.5 2"/><path d="M10 2h4"/><path d="M19 6l-1.5 1.5"/>'),
  claw: svg('<path d="M12 2v6"/><circle cx="12" cy="9.5" r="2.5" fill="#d9c4a3"/><path d="M10 11.5 6.5 15.5 8.5 20"/><path d="M14 11.5l3.5 4-2 4.5"/><path d="M12 12v6"/>'),
  pause: svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1.6" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.6" fill="currentColor" stroke="none"/>'),
  pumpkin: svg('<path d="M12 6.5c-1.2-2.6 1-4 2.5-4" stroke="#3f7a3a"/><ellipse cx="8.5" cy="14" rx="5" ry="6.5" fill="#f28a35"/><ellipse cx="15.5" cy="14" rx="5" ry="6.5" fill="#f28a35"/><ellipse cx="12" cy="14" rx="4" ry="7" fill="#f6a050"/><path d="M9.5 13l1 1.5h-2z M14.5 13l1 1.5h-2z" fill="#2a2230" stroke="none"/>'),
  island: svg('<path d="M3 15c3-2 15-2 18 0l-3 5H6z" fill="#8bd16a"/><path d="M12 15V6"/><path d="M12 6c-3-1-5 0-6 2M12 6c3-1 5 0 6 2M12 6c-1-2-3-3-5-3M12 6c1-2 3-3 5-3" stroke="#3f7a3a"/>'),
  bat: svg('<path d="M12 9c-2-3-6-4-10-2 2 1 2 3 2 4 1-1 3-1 4 1 1-1 3-1 4 1 1-2 3-2 4-1 1-2 3-2 4-1 0-1 0-3 2-4-4-2-8-1-10 2z" fill="#3b2a4a" stroke="#3b2a4a" stroke-width="1"/><path d="M10.5 7.5 10 5M13.5 7.5 14 5" stroke="#3b2a4a"/><circle cx="11" cy="9" r=".8" fill="#ffcf4a" stroke="none"/><circle cx="13" cy="9" r=".8" fill="#ffcf4a" stroke="none"/>'),
  bone: svg('<path d="M7 17 17 7" stroke-width="3.5" stroke="#f6ecd4"/><circle cx="5.5" cy="16" r="2" fill="#f6ecd4" stroke="none"/><circle cx="8" cy="18.5" r="2" fill="#f6ecd4" stroke="none"/><circle cx="16" cy="5.5" r="2" fill="#f6ecd4" stroke="none"/><circle cx="18.5" cy="8" r="2" fill="#f6ecd4" stroke="none"/>'),
  bolt: svg('<path d="M13 2 5 13.5h6L10 22l9-12h-6.5z" fill="#ffcf4a"/>'),
  share: svg('<path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  save: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="#fff7e6"/><circle cx="9" cy="10" r="1.8" fill="#ffcf4a"/><path d="m4.5 17 5-5 3.5 3.5 2.5-2.5 4 4"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2.5" fill="#d9c4a3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  restart: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  play: svg('<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>'),
  music: svg('<path d="M9 17V5l11-2v12"/><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="17.5" cy="15.5" r="2.5" fill="currentColor"/>'),
  musicOff: svg('<path d="M9 17V5l11-2v12"/><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="17.5" cy="15.5" r="2.5" fill="currentColor"/><path d="M3 3l18 18" stroke-width="2.4"/>'),
  monster: svg('<circle cx="12" cy="8" r="5.5" fill="#93c98a"/><rect x="7.5" y="13" width="9" height="8" rx="3.5" fill="#5f73a6"/><path d="M9.5 5.5h5M10.5 4.6v1.8M13.5 4.6v1.8"/><circle cx="10" cy="8.5" r=".9" fill="currentColor"/><circle cx="14" cy="8.5" r=".9" fill="currentColor"/><path d="M5.5 15h2M16.5 15h2"/>'),
  magnet: svg('<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z" fill="#e8384b"/><path d="M6 4h4M14 4h4" stroke="#d8dbe6" stroke-width="3"/>'),
  x2: svg('<circle cx="12" cy="12" r="9" fill="#ffcf4a"/><circle cx="12" cy="12" r="6.5" stroke-width="1.4"/><path d="M8.3 9.5l3 5M11.3 9.5l-3 5" stroke-width="1.8"/><path d="M13.2 10.4c.4-1 2.8-1.3 2.9.3.1 1.4-2.9 2.3-3 3.8h3.2" stroke-width="1.6"/>'),
  speed: svg('<path d="M3 8h6M2 12h6M3 16h6" stroke-width="1.8"/><path d="M14 3 9.5 12.5h4L12 21l7.5-11h-4.2z" fill="#8ff0c0"/>'),
  instant: svg('<path d="M12 2v5"/><circle cx="12" cy="8.5" r="2.2" fill="#d9c4a3"/><path d="M10 10 7 13.5l1.6 4M14 10l3 3.5-1.6 4"/><circle cx="12" cy="18" r="2.6" fill="#ff7fb0"/><path d="M4 4l1.5 1.5M20 4l-1.5 1.5M3 10h2M21 10h-2" stroke="#ffcf4a"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18" stroke-width="2.6"/>'),
  rotate: svg('<path d="M3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5"/><path d="m9 14 3 2.5-3 2.5"/>'),
  token: svg('<circle cx="12" cy="12" r="8.5" fill="#e6d9ff"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** Icon followed by a label, for buttons and pills. */
export const withIcon = (name: IconName, label: string): string => `${ICONS[name]}<span>${label}</span>`;
