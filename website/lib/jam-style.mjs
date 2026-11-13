import {JAM_THEME_IDS, JAM_BACKDROP_IDS} from '../../jams/manifest.mjs';

// Display names for the built-in presets. Colors and artwork live in Jam.css.
export const JAM_THEMES = Object.freeze([
  {id:'violet', label:'Zero violet'},
  {id:'ocean', label:'Ocean'},
  {id:'sunset', label:'Sunset'},
  {id:'forest', label:'Forest'},
  {id:'candy', label:'Candy'},
  {id:'midnight', label:'Midnight'},
]);
export const JAM_BACKDROPS = Object.freeze([
  {id:'stars', label:'Stars'},
  {id:'pixels', label:'Pixels'},
  {id:'grid', label:'Grid'},
  {id:'waves', label:'Waves'},
  {id:'confetti', label:'Confetti'},
  {id:'plain', label:'Plain'},
]);

// Jams created before style presets existed get a stable look from their ID,
// so every page and card stays the same between visits.
function hashed(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  return hash;
}
export function jamStyle(event) {
  const style = event?.style;
  if (style && JAM_THEME_IDS.includes(style.theme) && JAM_BACKDROP_IDS.includes(style.backdrop)) return {theme:style.theme, backdrop:style.backdrop};
  const hash = hashed(event?.id || event?.title);
  return {theme:JAM_THEME_IDS[hash % JAM_THEME_IDS.length], backdrop:JAM_BACKDROP_IDS[(hash >>> 8) % (JAM_BACKDROP_IDS.length - 1)]};
}
export function jamStyleClass(event) {
  const {theme, backdrop} = jamStyle(event);
  return `jam-theme-${theme} jam-backdrop-${backdrop}`;
}
