import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatCurrency } from '../../src/format.js';

describe('parseAmount accepts the ways people type money', () => {
  const ok = [
    ['450000', 450_000],
    ['450,000', 450_000],
    ['$450,000', 450_000],
    [' $ 450,000.50 ', 450_000.5],
    ['450k', 450_000],
    ['450K', 450_000],
    ['1.2m', 1_200_000],
    ['1.25M', 1_250_000],
    ['$2.5 million', 2_500_000],
  ];
  for (const [input, expected] of ok) {
    test(`"${input}" -> ${expected}`, () => assert.equal(parseAmount(input), expected));
  }

  const bad = ['', '   ', 'abc', '-5', '0', '12..5', '1,2,3k$x', null, undefined];
  for (const input of bad) {
    test(`${JSON.stringify(input)} -> null`, () => assert.equal(parseAmount(input), null));
  }

  test('rounds to the nearest cent', () => assert.equal(parseAmount('100.005'), 100.01));
});

describe('formatCurrency', () => {
  test('adds thousands separators and two decimals', () =>
    assert.equal(formatCurrency(1234.5), '$1,234.50'));
  test('formats zero', () => assert.equal(formatCurrency(0), '$0.00'));
  test('formats millions', () => assert.equal(formatCurrency(11854.5), '$11,854.50'));
  test('can drop cents for whole-dollar display', () =>
    assert.equal(formatCurrency(750000, { cents: false }), '$750,000'));
});
