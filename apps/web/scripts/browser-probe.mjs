#!/usr/bin/env node
/**
 * Headless-Chrome probe for UI review (no extra dependencies: Chrome DevTools Protocol over Node's built-in WebSocket).
 *
 *   node apps/web/scripts/browser-probe.mjs --base http://localhost:5173 --paths /dashboard,/budgets --as linh --out .cache/shots
 *
 * For every path x viewport (360, 768, 1440) x theme (light, dark) it saves a FULL-PAGE screenshot, and prints one JSON line per shot with:
 *   overflow   document is wider than the viewport (horizontal scroll)       errors    console errors / uncaught exceptions
 *   rawKeys    untranslated i18n keys visible on screen                       title     document.title
 * --as linh|minh|admin signs in through the real login form first (mock demo accounts, password Demo@12345); omit it for public pages.
 * --lang vi|en (default vi). --widths 360,768 / --themes dark limit the matrix. Chrome: env CHROME, else the usual Windows/macOS/Linux locations.
 * Look at the PNGs with the Read tool. The probe never edits the app.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:5173').replace(/\/$/, '');
// Git Bash on Windows rewrites a leading-slash argument into C:/Program Files/Git/...: undo that, and accept paths without the slash
const fixPath = (p) => '/' + p.replace(/^[A-Za-z]:.*?\/Git\//, '').replace(/^\/+/, '');
const paths = arg('paths', '/').split(',').map(fixPath);
const widths = arg('widths', '360,768,1440').split(',').map(Number);
const themes = arg('themes', 'light,dark').split(',');
const lang = arg('lang', 'vi');
const as = arg('as', '');
const out = resolve(arg('out', '.cache/shots'));
const settle = Number(arg('settle', '2500'));
const port = 9300 + Math.floor(Math.random() * 500);
const CREDS = { linh: 'linh@smartwallet.demo', minh: 'minh@smartwallet.demo', admin: 'admin@smartwallet.demo' };

const chrome = process.env.CHROME ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync);
if (!chrome) { console.error('Chrome not found: set CHROME=/path/to/chrome'); process.exit(2); }
mkdirSync(out, { recursive: true });
// the throwaway Chrome profile lives next to the screenshots (never in the system temp folder) and is removed at the end
const profileRoot = resolve(process.env.PROBE_TMP ?? join(out, '..', '.profiles'));
mkdirSync(profileRoot, { recursive: true });
const profile = mkdtempSync(join(profileRoot, 'sw-probe-'));

const proc = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 40 && !tabs; i++) { await wait(300); try { tabs = await (await fetch(`http://localhost:${port}/json`)).json(); } catch { /* chrome still starting */ } }
if (!tabs) { proc.kill(); console.error('Chrome did not start'); process.exit(2); }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map(); let errors = [];
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m.result);
  else if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`.slice(0, 300));
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 300));
};
await send('Runtime.enable'); await send('Page.enable');
const ev = async (expression) => (await send('Runtime.evaluate', { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true })).result?.value;
const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
const go = async (url, ms = settle) => { await send('Page.navigate', { url }); await wait(ms); };
const q = (u, theme) => `${base}${u}${u.includes('?') ? '&' : '?'}theme=${theme}&lang=${lang}`;

async function signIn(theme) {
  await viewport(1440, 900);
  await go(q('/login', theme), 3000);
  const email = CREDS[as] ?? as;
  const fill = async (label, text) => {
    const ok = await ev(`const l=[...document.querySelectorAll('label')].find(x=>/^(Email|Mật khẩu|Password)/.test(x.textContent.trim())&&x.textContent.trim().startsWith(${JSON.stringify(label)})); const el=l&&document.getElementById(l.htmlFor); if(!el) return false; el.focus(); return true`);
    if (ok) await send('Input.insertText', { text });
    return ok;
  };
  await fill(lang === 'en' ? 'Email' : 'Email', email); await fill(lang === 'en' ? 'Password' : 'Mật khẩu', 'Demo@12345');
  await ev(`const b=[...document.querySelectorAll('form button')].find(x=>x.type==='submit'); b&&b.click()`);
  await wait(3500);
}

let first = true;
for (const theme of themes) {
  if (as && first) { await signIn(theme); first = false; }
  for (const w of widths) {
    for (const p of paths) {
      errors = [];
      await viewport(w, 900);
      if (as) {
        // stay signed in (the token lives in memory): move through the SPA router instead of reloading
        await ev(`localStorage.setItem('sw-ui', JSON.stringify({ state: { theme: ${JSON.stringify(theme)}, language: ${JSON.stringify(lang)} }, version: 0 })); history.pushState({}, '', ${JSON.stringify(p)}); dispatchEvent(new PopStateEvent('popstate'))`);
        await ev(`document.documentElement.classList.toggle('dark', ${JSON.stringify(theme)} === 'dark')`);
        await wait(settle);
      } else await go(q(p, theme));
      const m = await send('Page.getLayoutMetrics');
      const h = Math.min(6000, Math.ceil(m.cssContentSize.height));
      await viewport(w, h); await wait(500);
      const info = JSON.parse(await ev(`const sw=document.documentElement.scrollWidth, cw=document.documentElement.clientWidth;
        const raw=(document.body.innerText.match(/\\b(nav|common|landing|authx|onb|plans|budgets|goals|wallets|reports|settings|dashboard|transactions|categories|admin|notifications|quickAdd|errors)\\.[a-zA-Z0-9_]+/g)||[]).slice(0,5);
        const wide=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>cw+1}).slice(0,4).map(e=>e.tagName+'.'+String(e.className).slice(0,50));
        return JSON.stringify({ path: location.pathname, overflow: sw>cw?{sw,cw,wide}:false, rawKeys: raw, title: document.title })`));
      const file = join(out, `${p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${w}-${theme}.png`);
      writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      console.log(JSON.stringify({ file, width: w, theme, ...info, errors: [...new Set(errors)] }));
    }
  }
}
proc.kill();
await wait(500);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file: harmless */ }
process.exit(0);
