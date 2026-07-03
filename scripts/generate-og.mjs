// Generates the static 1200×630 OG image at public/og.png from the brand mark
// on the teal brand color. Run: node scripts/generate-og.mjs
// Uses the system Chromium (PLAYWRIGHT_BROWSERS_PATH or /opt/pw-browsers/chromium)
// or a locally installed one.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mark = readFileSync(join(root, 'src/assets/brand/logo-teal-square.svg'), 'utf8');

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#2D7A6B;display:flex;align-items:center;
       font-family:Georgia,'DejaVu Serif',serif;overflow:hidden}
  .in{padding:0 96px;display:flex;flex-direction:column;gap:36px}
  .mark{width:110px;height:110px;border-radius:12px;overflow:hidden;
        box-shadow:0 18px 50px -20px rgba(0,0,0,.45)}
  .mark svg{width:100%;height:100%;display:block}
  h1{color:#FAF6EE;font-size:72px;font-weight:500;line-height:1.08;letter-spacing:-0.015em;max-width:18ch}
  .sub{color:#BFE0D7;font-size:30px;font-family:system-ui,sans-serif}
  .fishwrap{position:absolute;right:-60px;bottom:-60px;width:620px;opacity:.13}
  .fishwrap svg{width:100%;height:auto;fill:#FAF6EE}
</style></head>
<body>
  <div class="fishwrap">${readFileSync(join(root, 'src/assets/brand/pleco-fish.svg'), 'utf8')}</div>
  <div class="in">
    <div class="mark">${mark}</div>
    <h1>Own your membership program.</h1>
    <div class="sub">Pleco CODEC — one-time build · open source · your rails</div>
  </div>
</body></html>`;

const exe = ['/opt/pw-browsers/chromium', process.env.CHROME_PATH]
  .filter(Boolean).find(p => existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: join(root, 'public/og.png') });
await browser.close();
console.log('Wrote public/og.png');
