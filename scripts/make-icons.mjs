import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg');
for (const size of [192, 512]) await sharp(svg).resize(size, size).png().toFile(`public/icon-${size}.png`);
await sharp(svg).resize(180, 180).png().toFile('public/apple-touch-icon.png');
console.log('icons written');
