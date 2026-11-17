// Browser tests: drive the real page in Chromium the way a person would.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from '../../scripts/serve.js';

const { chromium } = createRequire(import.meta.url)('playwright');

let server, browser, page, url;

before(async () => {
  server = await startServer();
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

beforeEach(async () => {
  const context = await browser.newContext();
  context.setDefaultTimeout(5000);
  page = await context.newPage();
  await page.goto(url);
});

const total = () => page.getByTestId('total').textContent();
const amount = () => page.getByLabel('Mortgage amount');
const pickProvince = (name) => page.getByRole('radio', { name, exact: true }).check();

async function enterAmount(text) {
  await amount().fill(text);
}

describe('fee calculator page', () => {
  test('opens with a worked example already calculated', async () => {
    assert.equal(await amount().inputValue(), '450,000');
    assert.ok(await page.getByRole('radio', { name: 'Alberta', exact: true }).isChecked());
    assert.equal(await total(), '$1,129.00'); // $679 program + $450 registration
  });

  test('Ontario at $850,000 adds the premium and its 8% tax', async () => {
    await pickProvince('Ontario');
    await enterAmount('850000');
    assert.equal(await total(), '$1,006.11');
    const lines = await page.getByTestId('line').allTextContents();
    assert.ok(lines.some((l) => l.includes('Tax on premium') && l.includes('$8.00')), lines.join('|'));
  });

  test('understands shorthand like "1.2m"', async () => {
    await pickProvince('Quebec');
    await enterAmount('1.2m');
    assert.equal(await total(), '$1,845.00');
  });

  test('the amount is reformatted with separators when you leave the field', async () => {
    await enterAmount('1250000');
    await amount().blur();
    assert.equal(await amount().inputValue(), '1,250,000');
  });

  test('Quebec discharge options only appear for Quebec', async () => {
    const discharge = page.getByRole('group', { name: 'Quebec refinance type' });
    assert.equal(await discharge.isVisible(), false);
    await pickProvince('Quebec');
    assert.equal(await discharge.isVisible(), true);

    const includes = page.getByTestId('includes');
    assert.match(await includes.textContent(), /Three \(3\) unsecured debt payouts/);
    await page.getByRole('radio', { name: 'With discharge' }).check();
    assert.match(await includes.textContent(), /Unlimited discharges/);

    await pickProvince('Ontario');
    assert.equal(await discharge.isVisible(), false);
  });

  test('explains a bad amount instead of showing a wrong total', async () => {
    await enterAmount('abc');
    const alert = page.getByRole('alert');
    assert.match(await alert.textContent(), /Enter a mortgage amount/);
    assert.equal(await total(), '—');
  });

  test('quick amount buttons fill in the amount', async () => {
    await page.getByRole('button', { name: '$1M' }).click();
    assert.equal(await amount().inputValue(), '1,000,000');
  });

  test('compares all ten provinces and lets you jump to one', async () => {
    const rows = page.getByTestId('compare').locator('tbody tr');
    assert.equal(await rows.count(), 10);
    assert.equal(await page.locator('tbody tr[aria-current="true"] th').textContent(), 'Alberta');

    await enterAmount('300000');
    await page.getByRole('button', { name: 'Show Newfoundland and Labrador' }).click();
    assert.ok(await page.getByRole('radio', { name: 'Newfoundland and Labrador' }).isChecked());
    assert.equal(await total(), '$2,192.00'); // $992 + $1,200 registration
  });

  test('copy button copies a plain-text breakdown', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await page.getByRole('button', { name: 'Copy breakdown' }).click();
    assert.match(await page.getByRole('status').textContent(), /Copied/);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(text, /Alberta/);
    assert.match(text, /Total: \$1,129\.00/);
  });

  test('fits a phone screen without sideways scrolling', async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.equal(overflow, 0);
  });
});
