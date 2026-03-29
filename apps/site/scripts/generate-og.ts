import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');

const svg = readFileSync(resolve(publicDir, 'og.svg'));
await sharp(svg).png().toFile(resolve(publicDir, 'og.png'));
console.log('Generated public/og.png (1200x630)');
