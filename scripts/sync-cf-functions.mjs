/**
 * 将根目录 functions/ 同步到 public/functions/（Cloudflare Pages 根目录为 public 时必须）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'functions');
const dest = path.join(root, 'public', 'functions');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (name === 'node_modules') continue;
    const sf = path.join(from, name);
    const df = path.join(to, name);
    if (fs.statSync(sf).isDirectory()) copyDir(sf, df);
    else fs.copyFileSync(sf, df);
  }
}

if (!fs.existsSync(src)) {
  console.error('missing functions/');
  process.exit(1);
}
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
copyDir(src, dest);
console.log('synced functions -> public/functions');
