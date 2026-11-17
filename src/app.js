// Page wiring. All fee logic lives in fees.js; this file only reads inputs
// and renders the results.
import { PROVINCES, SCHEDULE_DATE, calculateFees } from './fees.js';
import { parseAmount, formatCurrency } from './format.js';

const ORDER = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL']; // west to east
const STORAGE_KEY = 'refinance-fee-calculator';
const EXAMPLE = { province: 'AB', amount: '450,000', qc: 'none' };

const $ = (id) => document.getElementById(id);
const els = {
  form: $('fee-form'),
  grid: $('province-grid'),
  amount: $('amount'),
  moneyInput: $('money-input'),
  exampleTag: $('example-tag'),
  error: $('amount-error'),
  qcOptions: $('qc-options'),
  sub: $('statement-sub'),
  lines: $('lines'),
  total: $('total'),
  notes: $('notes'),
  includes: $('includes'),
  copy: $('copy'),
  copyStatus: $('copy-status'),
  compareAmount: $('compare-amount'),
  compareBody: $('compare-body'),
};

let current = null; // last successful calculation

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function formatTyped(value) {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return value.toLocaleString('en-CA', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

// ---------- state ----------
function readState() {
  return {
    province: els.form.elements.province.value,
    amount: parseAmount(els.amount.value),
    rawAmount: els.amount.value,
    quebecDischarge: els.form.elements.qc.value === 'discharge',
  };
}

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      province: state.province,
      amount: state.rawAmount,
      qc: state.quebecDischarge ? 'discharge' : 'none',
    }));
  } catch { /* storage unavailable: nothing to remember */ }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && PROVINCES[saved.province] && typeof saved.amount === 'string') return saved;
  } catch { /* ignore */ }
  return null;
}

// ---------- rendering ----------
function buildProvinceGrid() {
  for (const code of ORDER) {
    const input = el('input', { type: 'radio', name: 'province', value: code, id: `prov-${code}` });
    els.grid.append(el('label', { class: 'prov', for: `prov-${code}` },
      input,
      el('span', { class: 'prov-code', 'aria-hidden': 'true', text: code }),
      el('span', { class: 'prov-name', text: PROVINCES[code].name })));
  }
}

function renderStatement(result) {
  els.lines.replaceChildren(...result.lines.map((line) => el('li', { class: 'line', 'data-testid': 'line' },
    el('div', { class: 'line-main' },
      el('span', { class: 'line-label', text: line.label }),
      el('span', { class: 'line-leader', 'aria-hidden': 'true' }),
      el('span', { class: 'line-amount', text: formatCurrency(line.amount) })),
    ...(line.detail ? [el('span', { class: 'line-detail', text: line.detail })] : []))));
  els.total.textContent = formatCurrency(result.total);
  els.sub.textContent = `${result.provinceName} · ${formatCurrency(result.amount)} mortgage`;
  els.notes.hidden = result.notes.length === 0;
  els.notes.textContent = result.notes.join(' ');
  els.includes.replaceChildren(...result.includes.map((item) => el('li', { text: item })));
  els.copy.disabled = false;
}

function renderEmpty(state) {
  els.lines.replaceChildren(el('li', { class: 'empty', text: 'Enter a valid amount to see the fees.' }));
  els.total.textContent = '—';
  els.sub.textContent = PROVINCES[state.province].name;
  els.notes.hidden = true;
  els.copy.disabled = true;
}

function renderCompare(state) {
  els.compareAmount.textContent = state.amount ? formatCurrency(state.amount) : 'this amount';
  const rows = ORDER.map((code) => {
    const name = PROVINCES[code].name;
    const r = state.amount
      ? calculateFees({ province: code, amount: state.amount, quebecDischarge: state.quebecDischarge })
      : null;
    const pick = (...keys) => r?.lines.filter((l) => keys.includes(l.key)).reduce((s, l) => s + l.amount, 0) ?? null;
    const cell = (value, extra = '') => el('td', { class: `num ${extra}`.trim(), text: value === null ? '—' : formatCurrency(value) });

    const button = el('button', { type: 'button', 'aria-label': `Show ${name}`, 'data-province': code, text: name });
    const row = el('tr', {},
      el('th', { scope: 'row' }, button),
      cell(PROVINCES[code].programFee / 100),
      cell(pick('registration')),
      cell(pick('premium', 'premiumTax')),
      cell(r ? r.total : null, 'total-cell'));
    if (code === state.province) row.setAttribute('aria-current', 'true');
    return row;
  });
  els.compareBody.replaceChildren(...rows);
}

function update({ persist = true } = {}) {
  const state = readState();
  els.qcOptions.hidden = state.province !== 'QC';
  els.copyStatus.textContent = '';

  const invalid = state.amount === null;
  els.moneyInput.classList.toggle('invalid', invalid);
  els.amount.setAttribute('aria-invalid', String(invalid));
  els.error.textContent = invalid
    ? 'Enter a mortgage amount greater than $0, like 450,000 or 1.2m.'
    : '';

  if (invalid) {
    current = null;
    renderEmpty(state);
  } else {
    current = calculateFees(state);
    renderStatement(current);
  }
  renderCompare(state);
  if (persist) save(state);
}

// ---------- copy ----------
function breakdownText(result) {
  const lines = result.lines.map((l) =>
    `${l.label}${l.detail ? ` (${l.detail})` : ''}: ${formatCurrency(l.amount)}`);
  return [
    `Refinance fees: ${result.provinceName}, ${formatCurrency(result.amount)} mortgage`,
    ...lines,
    `Total: ${formatCurrency(result.total)}`,
    ...result.notes,
    `Fees current as of ${SCHEDULE_DATE}.`,
  ].join('\n');
}

async function copyBreakdown() {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(breakdownText(current));
    els.copyStatus.textContent = 'Copied to clipboard';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('.statement'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    els.copyStatus.textContent = 'Your browser blocked copying. The statement is selected, so press Ctrl+C or ⌘C.';
  }
}

// ---------- events ----------
function setAmount(value) {
  els.amount.value = formatTyped(value);
  els.exampleTag.hidden = true;
  update();
}

function selectProvince(code) {
  els.form.elements.province.value = code;
  update();
}

function init() {
  buildProvinceGrid();
  const saved = load();
  const start = saved ?? EXAMPLE;
  els.form.elements.province.value = start.province;
  els.form.elements.qc.value = start.qc === 'discharge' ? 'discharge' : 'none';
  els.amount.value = start.amount;
  els.exampleTag.hidden = Boolean(saved);

  els.form.addEventListener('submit', (e) => e.preventDefault());
  els.form.addEventListener('change', (e) => {
    if (e.target.name === 'province' || e.target.name === 'qc') update();
  });
  els.amount.addEventListener('input', () => {
    els.exampleTag.hidden = true;
    update();
  });
  els.amount.addEventListener('blur', () => {
    const value = parseAmount(els.amount.value);
    if (value !== null) els.amount.value = formatTyped(value);
  });
  document.querySelectorAll('[data-amount]').forEach((btn) =>
    btn.addEventListener('click', () => setAmount(Number(btn.dataset.amount))));
  els.compareBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-province]');
    if (btn) selectProvince(btn.dataset.province);
  });
  els.copy.addEventListener('click', copyBreakdown);

  update({ persist: false });
}

init();
