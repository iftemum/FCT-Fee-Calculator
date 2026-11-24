// Prints expected totals from the tested JS fee engine as JSON.
import { calculateFees } from '../src/fees.js';
const amounts = JSON.parse(process.argv[2]);
const out = {};
for (const a of amounts) {
  out[a] = {};
  for (const p of ['BC','AB','SK','MB','ON','QC','NB','NS','PE','NL']) {
    const r = calculateFees({ province: p, amount: a });
    const get = (k) => r.lines.find((l) => l.key === k)?.amount ?? 0;
    out[a][p] = { program: get('program'), registration: get('registration'),
      premium: get('premium'), tax: get('premiumTax'), total: r.total };
  }
}
console.log(JSON.stringify(out));
