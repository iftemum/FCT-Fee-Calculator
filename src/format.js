// Parsing and formatting helpers for money typed by people.

const SUFFIX = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6 };

/**
 * Parse "450,000", "$450k", "1.2m", "$2.5 million" into dollars.
 * Returns null for anything that is not a positive amount.
 */
export function parseAmount(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.trim().toLowerCase().replace(/[$,\s]/g, '');
  const match = /^(\d+(?:\.\d+)?|\.\d+)(k|thousand|mm|m|million)?$/.exec(cleaned);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] ? SUFFIX[match[2]] : 1);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const withCents = new Intl.NumberFormat('en-CA', {
  style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const wholeDollars = new Intl.NumberFormat('en-CA', {
  style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

/** 1234.5 -> "$1,234.50"; with { cents: false } -> "$1,235". */
export function formatCurrency(value, { cents = true } = {}) {
  return (cents ? withCents : wholeDollars).format(value);
}
