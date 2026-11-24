// Fee engine for the Broker Refinance Program fee schedule.
// Source: "Title Insured Broker Refinance Program Fee Schedule",
// fees current as of November 2, 2026 (subject to change without notice).
//
// All arithmetic is done in integer cents so totals never drift.

export const SCHEDULE_DATE = 'November 2, 2026';

const STANDARD_INCLUDES = [
  'All searches',
  'Mortgage or Home Equity FlexLine registration',
  'Unlimited secured and unsecured debt payouts',
  'One signing appointment',
  'All discharge registration fees',
  'All applicable taxes',
];

const QC_NO_DISCHARGE_INCLUDES = [
  'Title searches',
  'Document preparation',
  'One signing appointment',
  'Three (3) unsecured debt payouts',
  'Registration',
  'Title insurance policy for the lender',
  'All applicable taxes',
];

const QC_DISCHARGE_INCLUDES = [
  'Title searches',
  'Document preparation',
  'One signing appointment',
  'Unlimited discharges and unsecured debt payouts',
  'Registration and cancellation fees',
  'Title insurance policy for the lender',
  'All applicable taxes',
];

// programFee in cents; premiumTaxBp = tax on premium in basis points
// (ON 8%, NL 15%, SK 6%, QC 9%, MB 0%; not listed = 0%).
// noPremium: FCT does not add the over-$750,000 premium to its fee in this
// province (Alberta, confirmed on real files: $920,000 -> $1,599, $815,000 -> $1,494).
export const PROVINCES = {
  BC: { name: 'British Columbia', programFee: 75085, registration: 'none', premiumTaxBp: 0 },
  AB: { name: 'Alberta', programFee: 67900, registration: 'perFiveThousand', premiumTaxBp: 0, noPremium: true },
  SK: { name: 'Saskatchewan', programFee: 70000, registration: 'saskChart', premiumTaxBp: 600 },
  MB: { name: 'Manitoba', programFee: 92500, registration: 'none', premiumTaxBp: 0 },
  ON: { name: 'Ontario', programFee: 89811, registration: 'none', premiumTaxBp: 800 },
  NB: { name: 'New Brunswick', programFee: 84900, registration: 'none', premiumTaxBp: 0 },
  NS: { name: 'Nova Scotia', programFee: 84900, registration: 'none', premiumTaxBp: 0 },
  NL: { name: 'Newfoundland and Labrador', programFee: 99200, registration: 'perHundred', premiumTaxBp: 1500 },
  PE: { name: 'Prince Edward Island', programFee: 108500, registration: 'none', premiumTaxBp: 0 },
  QC: { name: 'Quebec', programFee: 157250, registration: 'none', premiumTaxBp: 900 },
};

// Saskatchewan Variable Registration Fees: [upper bound in cents (inclusive), fee in cents].
const SASK_CHART = [
  [24_999_999, 20000],   // $0.00 – $249,999.99
  [50_000_000, 27500],   // $250,000 – $500,000
  [75_000_000, 52500],   // $500,000.01 – $750,000
  [100_000_000, 77500],  // $750,000.01 – $1,000,000.00
  [Infinity, 100000],    // $1,000,000.01 +
];

// Additional premium for credit over $750,000: [upper bound in cents (inclusive), premium in cents].
const PREMIUM_TIERS = [
  [75_000_000, 0],
  [100_000_000, 10000],  // $750,000.01 – $1,000,000
  [150_000_000, 25000],  // $1,000,000.01 – $1,500,000
  [200_000_000, 35000],  // $1,500,000.01 – $2,000,000
  [500_000_000, 75000],  // $2,000,000.01 – $5,000,000
];
const OVER_FIVE_MILLION_PER_THOUSAND = 65; // $0.65 per $1,000 over $5M

const toCents = (dollars) => Math.round(dollars * 100);
const toDollars = (cents) => cents / 100;
const unitsOf = (cents, unitCents) => Math.ceil(cents / unitCents); // partial unit counts as full

function lookupTier(table, cents) {
  return table.find(([upTo]) => cents <= upTo)[1];
}

function getProvince(code) {
  const province = PROVINCES[code];
  if (!province) throw new Error(`Unknown province: ${code}`);
  return province;
}

function assertAmount(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Mortgage amount must be a positive number');
  }
}

function registrationCents(code, cents) {
  switch (getProvince(code).registration) {
    case 'perFiveThousand': return unitsOf(cents, 500_000) * 500; // $5 per $5,000
    case 'perHundred': return unitsOf(cents, 10_000) * 40;        // $0.40 per $100
    case 'saskChart': return lookupTier(SASK_CHART, cents);
    default: return 0;
  }
}

function premiumCents(code, cents) {
  if (getProvince(code).noPremium) return 0;
  // British Columbia pays the additional premium only above $1,000,000.
  if (code === 'BC' && cents <= 100_000_000) return 0;
  if (cents <= 500_000_000) return lookupTier(PREMIUM_TIERS, cents);
  const over = cents - 500_000_000;
  return 75000 + unitsOf(over, 100_000) * OVER_FIVE_MILLION_PER_THOUSAND;
}

/** Registration fee (dollars) for a province and mortgage amount (dollars). */
export function registrationFee(code, amount) {
  assertAmount(amount);
  return toDollars(registrationCents(code, toCents(amount)));
}

/** Additional title insurance premium and its tax (dollars). */
export function insurancePremium(code, amount) {
  assertAmount(amount);
  const province = getProvince(code);
  const premium = premiumCents(code, toCents(amount));
  const tax = Math.round((premium * province.premiumTaxBp) / 10_000);
  return { premium: toDollars(premium), tax: toDollars(tax), taxRate: province.premiumTaxBp / 100 };
}

function registrationDetail(code, cents) {
  switch (PROVINCES[code].registration) {
    case 'perFiveThousand':
      return `$5 × ${unitsOf(cents, 500_000).toLocaleString('en-CA')} blocks of $5,000`;
    case 'perHundred':
      return `$0.40 × ${unitsOf(cents, 10_000).toLocaleString('en-CA')} blocks of $100`;
    case 'saskChart':
      return 'Saskatchewan variable registration chart';
    default:
      return '';
  }
}

function premiumDetail(cents) {
  if (cents <= 100_000_000) return 'Credit $750,000.01 – $1,000,000';
  if (cents <= 150_000_000) return 'Credit $1,000,000.01 – $1,500,000';
  if (cents <= 200_000_000) return 'Credit $1,500,000.01 – $2,000,000';
  if (cents <= 500_000_000) return 'Credit $2,000,000.01 – $5,000,000';
  const blocks = unitsOf(cents - 500_000_000, 100_000);
  return `$750 + $0.65 × ${blocks.toLocaleString('en-CA')} blocks of $1,000 over $5M`;
}

/**
 * Full fee breakdown.
 * @param {{province: string, amount: number, quebecDischarge?: boolean}} input
 */
export function calculateFees({ province: code, amount, quebecDischarge = false }) {
  const province = getProvince(code);
  assertAmount(amount);
  const cents = toCents(amount);

  const lines = [];
  const add = (key, label, value, detail = '') => lines.push({ key, label, cents: value, detail });

  add('program', 'Program fee', province.programFee,
    code === 'QC' ? (quebecDischarge ? 'Refinance with discharge' : 'Refinance with no discharge') : '');

  const reg = registrationCents(code, cents);
  if (reg > 0) add('registration', 'Registration fee', reg, registrationDetail(code, cents));

  const premium = premiumCents(code, cents);
  if (premium > 0) {
    add('premium', 'Additional insurance premium', premium, premiumDetail(cents));
    const tax = Math.round((premium * province.premiumTaxBp) / 10_000);
    if (tax > 0) add('premiumTax', 'Tax on premium', tax, `${province.premiumTaxBp / 100}% of premium`);
  }

  const notes = [];
  if (cents > 500_000_000) {
    notes.push('Above $5,000,000 the tax on the premium varies by province and amount. Confirm before quoting.');
  }

  const totalCents = lines.reduce((sum, line) => sum + line.cents, 0);
  const includes = code === 'QC'
    ? (quebecDischarge ? QC_DISCHARGE_INCLUDES : QC_NO_DISCHARGE_INCLUDES)
    : STANDARD_INCLUDES;

  return {
    province: code,
    provinceName: province.name,
    amount,
    lines: lines.map(({ cents: c, ...rest }) => ({ ...rest, amount: toDollars(c) })),
    total: toDollars(totalCents),
    includes: [...includes],
    notes,
  };
}
