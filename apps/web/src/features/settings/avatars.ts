/** Preset avatars: tiny inline SVG data URLs (<= 400 chars each), stored in `avatarUrl`. No upload exists yet (docs/backend-requests.md S4). */
const svg = (bg: string, body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='${bg}'/>${body}</svg>`)}`;
const W = '#fff';

const ALL = [
  svg('#2C7A58', `<circle cx='20' cy='15' r='6' fill='${W}'/><path d='M8 36a12 12 0 0124 0z' fill='${W}'/>`),
  svg('#4F6FA3', `<circle cx='20' cy='20' r='12' fill='none' stroke='${W}' stroke-width='3'/><circle cx='20' cy='20' r='4' fill='${W}'/>`),
  svg('#B85C38', `<path d='M0 34l12-14 10 10 6-6 12 10v6H0z' fill='${W}'/>`),
  svg('#5666A6', `<path d='M11 27a9 9 0 0118 0z' fill='${W}'/><path d='M6 31h28' stroke='${W}' stroke-width='3'/>`),
  svg('#B2506F', `<path d='M20 7l13 13-13 13L7 20z' fill='${W}'/>`),
  svg('#8C7442', `<path d='M9 12h22M9 20h16M9 28h20' stroke='${W}' stroke-width='4' stroke-linecap='round'/>`),
];

export const PRESET_AVATARS = ALL.filter((u) => u.length <= 400);
