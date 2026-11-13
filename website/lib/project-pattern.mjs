// Deterministic default card art: a mirrored 5 × 5 block pattern with one
// hue, seeded by "github-username/repository-name". The same project always
// gets the same pattern; nothing is stored or fetched.
const SIZE = 5;

function hash32(text, seed) {
  // FNV-1a with a seed, then a final avalanche so similar names diverge.
  let value = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13; value = Math.imul(value, 0xc2b2ae35) >>> 0;
  return (value ^ value >>> 16) >>> 0;
}

export function projectPatternSeed(author, name) {
  return `${String(author ?? '').trim().toLowerCase()}/${String(name ?? '').trim().toLowerCase()}`;
}

export function projectPattern(seed) {
  const text = String(seed ?? '');
  const bits = hash32(text, 1), hue = hash32(text, 2) % 360;
  const half = Math.ceil(SIZE / 2), cells = [];
  for (let row = 0; row < SIZE; row++) {
    for (let column = 0; column < half; column++) {
      if (!(bits >>> (row * half + column) & 1)) continue;
      cells.push([column, row]);
      if (column !== SIZE - 1 - column) cells.push([SIZE - 1 - column, row]);
    }
  }
  // An empty or full grid reads as a blank tile; keep a recognizable center.
  if (cells.length === 0 || cells.length === SIZE * SIZE) cells.splice(0, cells.length, [2, 1], [1, 2], [2, 2], [3, 2], [2, 3]);
  return {size:SIZE, cells, foreground:`hsl(${hue} 62% 52%)`, background:`hsl(${hue} 55% 92%)`};
}
