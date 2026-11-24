// Every expected value below is taken from the fee schedule document
// (fees current as of November 2, 2026). Amounts are in dollars.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVINCES,
  registrationFee,
  insurancePremium,
  calculateFees,
} from '../../src/fees.js';

const ALL = ['BC', 'AB', 'SK', 'MB', 'ON', 'NB', 'NS', 'NL', 'PE', 'QC'];

describe('program fee by province', () => {
  const expected = {
    BC: 750.85, AB: 679.0, SK: 700.0, MB: 925.0, ON: 898.11,
    NB: 849.0, NS: 849.0, NL: 992.0, PE: 1085.0, QC: 1572.5,
  };

  test('all ten provinces are listed', () => {
    assert.deepEqual(Object.keys(PROVINCES).sort(), [...ALL].sort());
  });

  for (const [code, fee] of Object.entries(expected)) {
    test(`${code} program fee is $${fee}`, () => {
      const result = calculateFees({ province: code, amount: 300_000 });
      const line = result.lines.find((l) => l.key === 'program');
      assert.equal(line.amount, fee);
    });
  }

  test('Quebec fee is $1,572.50 with or without a discharge', () => {
    for (const quebecDischarge of [true, false]) {
      const r = calculateFees({ province: 'QC', amount: 300_000, quebecDischarge });
      assert.equal(r.lines.find((l) => l.key === 'program').amount, 1572.5);
    }
  });
});

describe('registration fees', () => {
  test('provinces with no registration fee return $0', () => {
    for (const code of ['BC', 'MB', 'ON', 'NB', 'NS', 'PE', 'QC']) {
      assert.equal(registrationFee(code, 600_000), 0, code);
    }
  });

  describe('Alberta: $5 per $5,000 of the mortgage amount', () => {
    test('$300,000 -> $300', () => assert.equal(registrationFee('AB', 300_000), 300));
    test('$5,000 -> $5', () => assert.equal(registrationFee('AB', 5_000), 5));
    test('a partial $5,000 counts as a full one ($312,500 -> $315)', () =>
      assert.equal(registrationFee('AB', 312_500), 315));
    test('$1,000,000 -> $1,000', () => assert.equal(registrationFee('AB', 1_000_000), 1000));
  });

  describe('Newfoundland and Labrador: $0.40 per $100 of the mortgage amount', () => {
    test('$300,000 -> $1,200', () => assert.equal(registrationFee('NL', 300_000), 1200));
    test('$100 -> $0.40', () => assert.equal(registrationFee('NL', 100), 0.4));
    test('a partial $100 counts as a full one ($100,050 -> $400.40)', () =>
      assert.equal(registrationFee('NL', 100_050), 400.4));
  });

  describe('Saskatchewan variable registration fee chart', () => {
    const cases = [
      [0.01, 200],
      [249_999.99, 200],
      [250_000, 275],
      [500_000, 275],
      [500_000.01, 525],
      [750_000, 525],
      [750_000.01, 775],
      [1_000_000, 775],
      [1_000_000.01, 1000],
      [7_500_000, 1000],
    ];
    for (const [amount, fee] of cases) {
      test(`$${amount} -> $${fee}`, () => assert.equal(registrationFee('SK', amount), fee));
    }
  });
});

describe('additional title insurance premium (credit over $750,000)', () => {
  const tiers = [
    [750_000, 0],
    [750_000.01, 100],
    [1_000_000, 100],
    [1_000_000.01, 250],
    [1_500_000, 250],
    [1_500_000.01, 350],
    [2_000_000, 350],
    [2_000_000.01, 750],
    [5_000_000, 750],
  ];
  for (const [amount, premium] of tiers) {
    test(`ON $${amount} -> premium $${premium}`, () =>
      assert.equal(insurancePremium('ON', amount).premium, premium));
  }

  test('over $5M: $750 plus $0.65 per $1,000 over $5M ($6M -> $1,400)', () =>
    assert.equal(insurancePremium('ON', 6_000_000).premium, 1400));

  test('over $5M: a partial $1,000 counts as a full one ($5,000,500 -> $750.65)', () =>
    assert.equal(insurancePremium('ON', 5_000_500).premium, 750.65));

  describe('Alberta: FCT does not add the over-$750,000 premium (confirmed on real files)', () => {
    test('$920,000 -> premium $0', () => assert.equal(insurancePremium('AB', 920_000).premium, 0));
    test('$2,500,000 -> premium $0', () => assert.equal(insurancePremium('AB', 2_500_000).premium, 0));
    test('FCT file: plan limit $920,000 -> FCT fee $1,599', () =>
      assert.equal(calculateFees({ province: 'AB', amount: 920_000 }).total, 1599));
    test('FCT file: plan limit $815,000 -> FCT fee $1,494', () =>
      assert.equal(calculateFees({ province: 'AB', amount: 815_000 }).total, 1494));
  });

  describe('British Columbia only pays the premium above $1,000,000', () => {
    test('$900,000 -> $0', () => assert.equal(insurancePremium('BC', 900_000).premium, 0));
    test('$1,000,000 -> $0', () => assert.equal(insurancePremium('BC', 1_000_000).premium, 0));
    test('$1,000,000.01 -> $250', () =>
      assert.equal(insurancePremium('BC', 1_000_000.01).premium, 250));
  });

  describe('tax on premium matches the published table', () => {
    // [amount, { province: tax }] straight from the document.
    const table = [
      [800_000, { ON: 8, NL: 15, SK: 6, MB: 0, QC: 9 }],
      [1_200_000, { ON: 20, NL: 37.5, SK: 15, MB: 0, QC: 22.5 }],
      [1_800_000, { ON: 28, NL: 52.5, SK: 21, MB: 0, QC: 31.5 }],
      [3_000_000, { ON: 60, NL: 112.5, SK: 45, MB: 0, QC: 67.5 }],
    ];
    for (const [amount, taxes] of table) {
      for (const [code, tax] of Object.entries(taxes)) {
        test(`${code} $${amount} -> tax $${tax}`, () =>
          assert.equal(insurancePremium(code, amount).tax, tax));
      }
    }

    test('provinces without a listed tax pay $0 tax on the premium', () => {
      for (const code of ['AB', 'NB', 'NS', 'PE', 'BC']) {
        assert.equal(insurancePremium(code, 1_200_000).tax, 0, code);
      }
    });

    test('over $5M the provincial rate still applies (ON $6M -> $112)', () =>
      assert.equal(insurancePremium('ON', 6_000_000).tax, 112));
  });
});

describe('calculateFees totals', () => {
  const cases = [
    ['AB', 400_000, 1079.0],          // 679 + 400 registration
    ['ON', 500_000, 898.11],          // program fee only
    ['ON', 850_000, 1006.11],         // 898.11 + 100 premium + 8 tax
    ['SK', 800_000, 1581.0],          // 700 + 775 reg + 100 + 6
    ['SK', 300_000, 975.0],           // 700 + 275 reg
    ['QC', 1_200_000, 1845.0],        // 1572.50 + 250 + 22.50
    ['NL', 2_500_000, 11_854.5],      // 992 + 10,000 reg + 750 + 112.50
    ['BC', 1_200_000, 1000.85],       // 750.85 + 250
    ['BC', 950_000, 750.85],          // BC exempt below $1M
    ['PE', 750_000.01, 1185.0],       // 1085 + 100
    ['MB', 1_600_000, 1275.0],        // 925 + 350 + 0 tax
  ];
  for (const [province, amount, total] of cases) {
    test(`${province} $${amount} -> total $${total}`, () => {
      const r = calculateFees({ province, amount });
      assert.equal(r.total, total);
    });
  }

  test('lines always add up to the total', () => {
    for (const province of ALL) {
      for (const amount of [125_000, 755_000, 1_250_000, 4_000_000, 6_250_000]) {
        const r = calculateFees({ province, amount });
        const sum = r.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0) / 100;
        assert.equal(sum, r.total, `${province} ${amount}`);
      }
    }
  });

  test('zero-dollar premium lines are left out below $750,000', () => {
    const r = calculateFees({ province: 'ON', amount: 500_000 });
    assert.deepEqual(r.lines.map((l) => l.key), ['program']);
  });

  test('returns the province name and echoes the amount', () => {
    const r = calculateFees({ province: 'NS', amount: 420_000 });
    assert.equal(r.provinceName, 'Nova Scotia');
    assert.equal(r.amount, 420_000);
  });

  test('flags amounts above $5M for confirmation (tax varies)', () => {
    assert.ok(calculateFees({ province: 'ON', amount: 6_000_000 }).notes.length > 0);
    assert.equal(calculateFees({ province: 'ON', amount: 4_000_000 }).notes.length, 0);
  });
});

describe('what the program fee includes', () => {
  test('standard provinces include unlimited payouts and discharge fees', () => {
    const { includes } = calculateFees({ province: 'ON', amount: 300_000 });
    assert.ok(includes.some((i) => /unlimited secured and unsecured debt payouts/i.test(i)));
    assert.ok(includes.some((i) => /discharge registration fees/i.test(i)));
  });

  test('Quebec without a discharge includes three unsecured debt payouts', () => {
    const { includes } = calculateFees({ province: 'QC', amount: 300_000, quebecDischarge: false });
    assert.ok(includes.some((i) => /three \(3\) unsecured debt payouts/i.test(i)));
  });

  test('Quebec with a discharge includes unlimited discharges and cancellation fees', () => {
    const { includes } = calculateFees({ province: 'QC', amount: 300_000, quebecDischarge: true });
    assert.ok(includes.some((i) => /unlimited discharges/i.test(i)));
    assert.ok(includes.some((i) => /cancellation fees/i.test(i)));
  });
});

describe('input validation', () => {
  test('rejects an unknown province', () =>
    assert.throws(() => calculateFees({ province: 'YT', amount: 300_000 }), /province/i));
  test('rejects zero', () =>
    assert.throws(() => calculateFees({ province: 'ON', amount: 0 }), /amount/i));
  test('rejects negative amounts', () =>
    assert.throws(() => calculateFees({ province: 'ON', amount: -1 }), /amount/i));
  test('rejects NaN', () =>
    assert.throws(() => calculateFees({ province: 'ON', amount: Number.NaN }), /amount/i));
});
