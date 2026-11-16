// @ts-check
/* global window, document -- used inside page.evaluate(), which runs in the browser */
/**
 * Regenerates the documentation images:
 *   docs/screenshots/web/*.png  screenshots of the running app (sample data)
 *   docs/diagrams/web/*.png     the Mermaid class diagrams from docs/DOCUMENTATION.md
 *
 * Usage: npm run docs:images   (needs `npx playwright install chromium` once)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createApp, createContext } from '../src/api/app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const docs = path.resolve(webRoot, '..', 'docs');
const shots = path.join(docs, 'screenshots', 'web');
const diagrams = path.join(docs, 'diagrams', 'web');
fs.mkdirSync(shots, { recursive: true });
fs.mkdirSync(diagrams, { recursive: true });

const context = await createContext({
  storage: 'memory', dataDir: '', demoMode: true, secureCookies: false, trustProxy: false, timeZone: 'Asia/Manila',
});
const server = createApp(context).listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;
const browser = await chromium.launch();

try {
  await captureScreens();
  await renderDiagrams();
} finally {
  await browser.close();
  server.close();
}

async function captureScreens() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', timezoneId: 'Asia/Manila' });
  const page = await ctx.newPage();
  const shot = async (/** @type {string} */ name, /** @type {boolean} */ full = false) => {
    await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: full });
    console.info(`screenshot ${name}.png`);
  };

  await page.goto(`${base}/`);
  await shot('login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Sign out' }).waitFor();
  await shot('dashboard');
  await shot('dashboard-full', true);

  for (const [route, name] of [['/appointments?period=upcoming', 'appointments'], ['/patients', 'patients'], ['/staff', 'medical-staff'],
    ['/records', 'records'], ['/calendar', 'calendar'], ['/patients/P-0001', 'patient-profile'], ['/audit', 'audit-log'], ['/accounts', 'accounts']]) {
    await page.goto(`${base}/#${route}`);
    await shot(name);
  }

  await page.goto(`${base}/#/staff`);
  await page.locator('tbody tr').first().click();
  await shot('medical-staff');

  await page.goto(`${base}/#/appointments`);
  await page.getByRole('button', { name: 'Book appointment' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Book appointment' });
  const pick = async (/** @type {string} */ label, /** @type {string} */ text) => {
    const select = dialog.getByLabel(label);
    await select.selectOption(await select.locator('option', { hasText: text }).first().getAttribute('value') ?? '');
  };
  await pick('Patient', 'Angela Ramos');
  await pick('Attending staff', 'Carlo Mendoza');
  await dialog.getByLabel('Date').fill(nextWeekday());
  await dialog.getByLabel('Date').dispatchEvent('change');
  await dialog.getByRole('radio').first().waitFor();
  await dialog.getByRole('radio').first().click();
  await dialog.getByLabel('Reason for visit').fill('Tooth extraction consult');
  await shot('book-appointment');
  await page.keyboard.press('Escape');

  await page.goto(`${base}/#/records`);
  await page.locator('tbody tr').first().dblclick();
  await shot('appointment-details');
  await page.keyboard.press('Escape');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${base}/#/dashboard`);
  await shot('dashboard-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  const board = await ctx.newPage();
  await board.goto(`${base}/board`);
  await board.getByText('Live').waitFor();
  await board.waitForTimeout(500);
  await board.screenshot({ path: path.join(shots, 'queue-board.png') });
  console.info('screenshot queue-board.png');

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const mobile = await phone.newPage();
  await mobile.goto(`${base}/`);
  await mobile.getByLabel('Username').fill('reception');
  await mobile.getByLabel('Password').fill('reception123');
  await mobile.getByRole('button', { name: 'Sign in' }).click();
  await mobile.getByRole('button', { name: 'Sign out' }).waitFor();
  await mobile.goto(`${base}/#/appointments?period=upcoming`);
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: path.join(shots, 'phone-appointments.png') });
  console.info('screenshot phone-appointments.png');
  await phone.close();
  await ctx.close();
}

async function renderDiagrams() {
  const markdown = fs.readFileSync(path.join(docs, 'DOCUMENTATION.md'), 'utf8');
  const blocks = [...markdown.matchAll(/^### (4\.\d [^\n]+)\n\n```mermaid\n(classDiagram[\s\S]*?)```/gm)].map((m) => [m[0], m[1], m[2]]);
  const flowchart = /^## 3\. Architecture\n\n```mermaid\n(flowchart[\s\S]*?)```/m.exec(markdown);
  if (flowchart) {
    blocks.unshift(['', '4.0 Architecture', flowchart[1]]);
  }
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent('<!doctype html><html><body style="margin:0;background:#fff"><div id="out"></div></body></html>');
  await page.addScriptTag({ path: path.join(webRoot, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js') });
  for (const [, title, source] of blocks) {
    const name = `fig${title.slice(2, 3)}-${title.slice(4).toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`;
    await page.evaluate(async ({ code, id }) => {
      const m = /** @type {any} */ (window).mermaid;
      m.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'Segoe UI, Arial, sans-serif', classDiagram: { useMaxWidth: false } });
      const { svg } = await m.render(id, code);
      const out = /** @type {HTMLElement} */ (document.getElementById('out'));
      out.innerHTML = svg;
      out.style.display = 'inline-block';
      out.style.padding = '24px';
    }, { code: source, id: name });
    await page.locator('#out').screenshot({ path: path.join(diagrams, `${name}.png`) });
    console.info(`diagram ${name}.png`);
  }
  await ctx.close();
}

/** A Monday–Saturday date a few days ahead, as YYYY-MM-DD. */
function nextWeekday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  d.setDate(d.getDate() + 3);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
