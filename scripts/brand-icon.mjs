import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

// Deliberately support the small, approved brand vocabulary. New shapes require
// updating this renderer rather than silently shipping stale native pixels.
export function readBrand(root) {
  const source = readFileSync(path.join(root, 'design/brand/zero-purple.svg'), 'utf8');
  const match = source.match(/<g stroke="(#[0-9a-f]{6})" stroke-width="([\d.]+)">\s*<circle cx="12" cy="12" r="([\d.]+)"\/>\s*<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="([\d.]+)" transform="rotate\(-45 12 12\)" fill="\1" stroke="none"\/>\s*<\/g>/i);
  assert.ok(match && /viewBox="0 0 24 24"/.test(source), 'Unsupported canonical Zero brand geometry');
  assert.match(source.replace(match[0], '').trim(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1024" height="1024" viewBox="0 0 24 24" fill="none" role="img" aria-label="Zero">\s*<\/svg>$/, 'Unsupported canonical Zero brand elements');
  const [color, stroke, radius, x, y, width, height, corner] = match.slice(1).map((value, index) => index ? Number(value) : value);
  assert.ok([stroke,radius,x,y,width,height,corner].every(Number.isFinite));
  assert.ok(stroke > 0 && radius > 0 && radius + stroke / 2 <= 12 && height === stroke && corner >= 0 && corner <= height / 2);
  assert.ok(Math.abs(x + width / 2 - 12) < 1e-8 && Math.abs(y + height / 2 - 12) < 1e-8, 'Brand slash must remain centered');
  const tile = readFileSync(path.join(root, 'design/brand/zero-purple-on-white.svg'), 'utf8');
  assert.ok(tile.includes(match[0]) && tile.includes('<rect width="24" height="24" fill="#ffffff"/>'), 'Native brand tile must match the canonical mark');
  return {color,stroke,radius,x,y,width,height,corner,source};
}

export function editorBrandSvg(root) {
  const {source,color} = readBrand(root);
  return source.replace('width="1024" height="1024"', 'width="24" height="24"').replace(' role="img" aria-label="Zero"', '').replaceAll(color, 'currentColor');
}

export function brandSample(px, py, brand) {
  const ring = Math.abs(Math.hypot(px - 12, py - 12) - brand.radius) <= brand.stroke / 2;
  // Inverse of the source rect's -45 degree rotation about the canvas center.
  const u = ((px - 12) - (py - 12)) / Math.SQRT2;
  const v = ((px - 12) + (py - 12)) / Math.SQRT2;
  const qx = Math.max(Math.abs(u) - (brand.width / 2 - brand.corner), 0);
  const qy = Math.max(Math.abs(v) - (brand.height / 2 - brand.corner), 0);
  return ring || Math.hypot(qx, qy) <= brand.corner;
}
