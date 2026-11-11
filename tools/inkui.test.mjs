import assert from 'node:assert/strict';
import {readFile, mkdir, mkdtemp, copyFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve, join, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {startServer} from '../../GeezSuite/core/serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'tools/out');
const source = new URL('../../GeezSuite/data/gaia-v2.json', import.meta.url);
const original = await readFile(source);
const dir = await mkdtemp(join(tmpdir(), 'geez-inkui-'));
const {chromium} = await import(pathToFileURL(join(process.env.APPDATA,
  'npm/node_modules/@playwright/mcp/node_modules/playwright/index.mjs')).href);
let app, web, browser;
try {
  await mkdir(out, {recursive: true});
  await copyFile(source, join(dir, 'gaia.json'));
  app = await startServer({file: join(dir, 'gaia.json'), port: 0});
  const api = `http://127.0.0.1:${app.server.address().port}`;
  web = createServer(async (req, res) => {
    try {
      const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
      if (!path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
      const data = await readFile(path);
      res.setHeader('Content-Type', ({'.html': 'text/html', '.js': 'text/javascript',
        '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.webp': 'image/webp'})[extname(path)] || 'application/octet-stream');
      res.end(data);
    } catch {
      // The seed campaign references optional token portraits absent from this
      // checkout. Match the avatar fallback without masking missing code/CSS.
      if (req.url.startsWith('/tokens/')) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#332a21"/></svg>');
      } else res.writeHead(404).end();
    }
  });
  await new Promise(ok => web.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${web.address().port}`;
  browser = await chromium.launch({headless: true, channel: 'msedge'});
  const context = await browser.newContext({deviceScaleFactor: 1});
  // No internet: empty CDN styles/SDKs and a neutral placeholder for remote
  // avatars. The real local Gaia adapter, data, JS and CSS run unmodified.
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base + '/') || url.startsWith(api + '/') || url.startsWith('data:')) return route.continue();
    const type = route.request().resourceType();
    if (type === 'image') return route.fulfill({contentType: 'image/svg+xml', body:
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#332a21"/></svg>'});
    return route.fulfill({contentType: type === 'stylesheet' ? 'text/css' : 'text/javascript', body: ''});
  });

  for (const name of ['sheet', 'index']) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text() + ' ' + message.location().url); });
    const query = new URLSearchParams({db: 'gaia', gaia: api, gm: 'jonny', campaign: 'world__daddies', test: ''});
    if (name === 'sheet') query.set('live', 'world__daddies');
    await page.goto(`${base}/${name}.html?${query}`, {waitUntil: 'load'});
    if (name === 'sheet') {
      await page.waitForFunction(() => document.querySelector('#cardsWrap')?.textContent.includes('Ashara'));
      // Show real expanded content in screenshots, using the page's controls.
      for (const id of ['wpbtn-ashara']) {
        const button = page.locator('#' + id);
        if (await button.count()) await button.click();
      }
    } else {
      await page.waitForFunction(() => window.__SHEETS__?.state().data.pcs.ashara);
      await page.evaluate(() => {
        window.__SHEETS__.view('DM_BOARD');
        const things = Object.values(window.__SHEETS__.state().data.things);
        const selected = things.find(t => t.type === 'location') || things[0];
        if (selected) window.__SHEETS__.select(selected.id);
      });
      await page.locator('#cardPop').waitFor({state: 'visible'});
    }
    for (const width of [1280, 360]) {
      await page.setViewportSize({width, height: 1000});
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => scrollTo(0, 0));
      const styles = await page.evaluate(() => {
        const panel = document.querySelector('.card-header, #cardPop');
        const text = document.querySelector('.char-name, #entityTitle');
        return {
          loaded: [...document.styleSheets].some(s => s.href?.endsWith('/css/ink-ui.css') && s.cssRules.length > 0),
          last: [...document.head.querySelectorAll('link')].at(-1)?.getAttribute('href'),
          background: getComputedStyle(document.body).backgroundColor,
          scheme: getComputedStyle(document.documentElement).colorScheme,
          blend: getComputedStyle(panel, '::after').mixBlendMode,
          textureOpacity: getComputedStyle(panel, '::after').opacity,
          scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          viewport: innerWidth,
          panelFilter: getComputedStyle(panel).filter,
          textFilter: getComputedStyle(text).filter,
          texture: getComputedStyle(panel, '::after').backgroundImage,
          edge: getComputedStyle(panel, '::before').clipPath,
          layer: getComputedStyle(panel, '::after').zIndex,
        };
      });
      assert.equal(styles.loaded, true, `${name}: stylesheet loaded`);
      assert.equal(styles.last, 'css/ink-ui.css');
      assert.equal(styles.background, 'rgb(236, 227, 208)', `${name}: light body`);
      assert.ok(styles.scroll <= styles.viewport, `${name} at ${width}: horizontal overflow ${styles.scroll}`);
      assert.equal(styles.scheme, 'light');
      assert.equal(styles.blend, 'multiply');
      assert.equal(styles.textureOpacity, '0.55');
      assert.equal(styles.panelFilter, 'none');
      assert.equal(styles.textFilter, 'none');
      assert.match(styles.texture, /feTurbulence/);
      assert.match(styles.edge, /polygon/);
      assert.ok(Number(styles.layer) < 0, 'texture stays behind content');
      const contrast = await page.evaluate(() => {
        const rgba = value => value.match(/[\d.]+/g)?.map(Number);
        const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
        const luminance = rgb => rgb.slice(0, 3).map(v => {
          const c = v / 255;
          return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
        }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
        const visible = el => {
          if (!el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) return false;
          return [...function* () { for (let p = el; p; p = p.parentElement) yield p; }()]
            .every(p => Number(getComputedStyle(p).opacity) > 0);
        };
        // Composite transparent controls over their ancestors. Check both ends
        // of surface gradients, and the paper layer behind parchment content.
        const backgrounds = el => {
          if (!el) return [[255, 255, 255]];
          const style = getComputedStyle(el);
          let colors = backgrounds(el.parentElement).map(bg => blend(rgba(style.backgroundColor), bg));
          const stops = style.backgroundImage.match(/rgba?\([^)]+\)/g) || [];
          if (stops.length) colors = colors.flatMap(bg => stops.map(stop => blend(rgba(stop), bg)));
          const paper = getComputedStyle(el, '::before');
          if (paper.content !== 'none' && paper.content !== 'normal' && Number(paper.zIndex) < 0) {
            colors = colors.map(bg => blend(rgba(paper.backgroundColor), bg));
          }
          return colors;
        };
        const failures = [];
        let count = 0;
        for (const button of document.querySelectorAll('button, [role="button"], a.btn')) {
          if (!visible(button)) continue;
          count++;
          // Include nested labels/icons with their own colour declarations.
          for (const label of [button, ...button.querySelectorAll('*')]) {
            if (!visible(label)) continue;
            const fg = rgba(getComputedStyle(label).color);
            const ratio = Math.min(...backgrounds(label).map(bg => {
              const a = luminance(blend(fg, bg)), b = luminance(bg);
              return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            }));
            if (ratio < 4.5) failures.push({button: button.id || button.textContent.trim().slice(0, 60),
              label: label.className, color: getComputedStyle(label).color, ratio});
          }
        }
        return {count, failures};
      });
      assert.ok(contrast.count > 0, `${name}: visible buttons checked`);
      assert.deepEqual(contrast.failures, [], `${name} at ${width}: button contrast >= 4.5:1`);
      await page.screenshot({path: join(out, `inkui-${name}-${width}.png`), fullPage: true});
      console.log(`PASS ${name} ${width}: loaded, light, AA buttons, crisp text, no horizontal scroll`);
    }
    assert.deepEqual(errors, [], `${name}: browser errors`);
    await page.close();
  }
  await writeFile(join(out, 'light-commit.txt'), 'Convert shared ink UI to a light parchment theme with AA button contrast checks\n');
} finally {
  await browser?.close();
  web?.closeAllConnections();
  if (web) await new Promise(ok => web.close(ok));
  app?.server.closeAllConnections();
  await app?.close();
  assert.deepEqual(await readFile(source), original, 'source Gaia remains byte-identical');
  await rm(dir, {recursive: true, force: true});
}
