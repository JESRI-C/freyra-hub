import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = new URL('../', import.meta.url);
const register = JSON.parse(await readFile(new URL('src/components/development/product-plan.json', root), 'utf8'));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('docs/skyhost-development-board.html', root).href);
  assert.equal(await page.locator('article').count(), register.features.length);
  assert.equal(await page.locator('[data-res-id="F-040"]').count(), 1);
  assert.equal(await page.getByRole('region', { name: 'Implementering', exact: true }).locator('[data-res-id="F-040"]').count(), 1, 'Catalogue pricing is implemented but full rental-cost acceptance remains open');
  await page.locator('#search').fill('F-040');
  assert.equal(await page.locator('article').count(), 1);
  await page.locator('article summary').click();
  assert.match(await page.locator('article').innerText(), /deldag/);
  assert.equal(await page.getByRole('link', { name: /Mulig genbrug:/ }).count(), 2);
  await page.locator('#module').selectOption('GPS');
  assert.equal(await page.locator('article').count(), 0);
  await page.locator('#search').fill('');
  assert.equal(await page.locator('article').count(), register.features.filter(f => f.module === 'GPS').length);
  await page.locator('#module').selectOption('');
  await page.locator('#state').selectOption('done');
  assert.equal(await page.locator('article').count(), 0);
  await page.locator('#state').selectOption('');
  await page.getByText('Åbn demo fra tavlen', { exact: true }).click();
  await page.locator('#base').fill('javascript:alert(1)');
  assert.match(await page.locator('#base-feedback').innerText(), /gyldig/);
  assert.equal(await page.getByRole('link', { name: /^Åbn demo:/ }).count(), 0);
  await page.locator('#base').fill('http://127.0.0.1:4180');
  await page.locator('[data-res-id="F-037"] summary').click();
  assert.equal(await page.getByRole('link', { name: 'Åbn demo: /app/connect/devices', exact: true }).first().getAttribute('href'), 'http://127.0.0.1:4180/app/connect/devices');
  await page.locator('[data-res-id="F-035"] summary').click();
  assert.equal(await page.locator('a[href*="<"]').count(), 0, 'Unfilled demo placeholders must not become links');
  await mkdir(new URL('tmp/skyhost-board/', root), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('tmp/skyhost-board/desktop.png', root)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#search').fill('F-040');
  await page.locator('article summary').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: fileURLToPath(new URL('tmp/skyhost-board/mobile.png', root)), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ cards: register.features.length, filters: true, acceptanceVisible: true, codeLinks: true, demoLinks: true, unsafeDemoRejected: true, mobileOverflow: false, scriptErrors: errors.length }));
} finally {
  await browser.close();
}
