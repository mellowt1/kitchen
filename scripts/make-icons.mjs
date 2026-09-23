// Draws the app icon, a pizza on flour paper in the design's colours, and writes the PNGs.
//   npm run icons
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';

const GROUND = '#F4EFE6';
const CRUST = '#E3C290';
const TOMATO = '#C2402A';
const CHEESE = '#FBF8F2';
const BASIL = '#3E6B3A';
const INK = '#2B2420';

// mark: share of the icon the 24px mark box takes.
function svg(size, mark) {
  const g = size * mark;
  const off = (size - g) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${GROUND}"/>
  <g transform="translate(${off} ${off}) scale(${g / 24})">
    <circle cx="12" cy="12" r="11" fill="${CRUST}"/>
    <circle cx="12" cy="12" r="11" fill="none" stroke="${INK}" stroke-opacity=".18" stroke-width=".5"/>
    <circle cx="12" cy="12" r="9" fill="${TOMATO}"/>
    <circle cx="8.6" cy="9.4" r="2" fill="${CHEESE}"/>
    <circle cx="15.2" cy="8.6" r="1.6" fill="${CHEESE}"/>
    <circle cx="13.2" cy="15.4" r="2.2" fill="${CHEESE}"/>
    <circle cx="7.9" cy="14.6" r="1.3" fill="${CHEESE}"/>
    <path d="M15.6 12.4c1.7-1.3 3.4-.9 3.9-.5-.4 1.6-2.2 2.6-3.9.5z" fill="${BASIL}"/>
    <path d="M10.4 11.8c-.4-1.6.6-2.9 1.1-3.2 1 1.3.6 3-1.1 3.2z" fill="${BASIL}"/>
  </g>
</svg>`;
}

const out = new URL('../app/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const jobs = [
  ['icon-180.png', 180, 0.72],
  ['icon-192.png', 192, 0.72],
  ['icon-512.png', 512, 0.72],
  // Maskable: the mark stays inside the 80% safe zone, with room to spare.
  ['icon-512-maskable.png', 512, 0.56],
];
for (const [name, size, mark] of jobs) {
  const png = new Resvg(svg(size, mark)).render().asPng();
  writeFileSync(new URL(name, out), png);
  console.log(name, png.length, 'bytes');
}
writeFileSync(new URL('icon.svg', out), svg(512, 0.72));
