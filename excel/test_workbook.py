"""Recalculate the workbook in LibreOffice for many amounts and compare every
province's fees against the tested JavaScript engine (src/fees.js)."""
import json, os, shutil, subprocess, sys, tempfile
from openpyxl import load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
BOOK = os.path.join(HERE, 'FCT-Fee-Calculator.xlsx')
RECALC = sys.argv[1]  # path to recalc.py
AMOUNTS = [815000, 920000, 220000, 238000, 280000, 312500, 400000, 100050, 249999.99, 250000,
           500000, 500000.01, 750000, 750000.01, 1000000, 1000000.01,
           1500000.01, 2000000.01, 3000000, 5000000, 5000500, 6000000]
CODES = ['BC','AB','SK','MB','ON','QC','NB','NS','PE','NL']

expected = json.loads(subprocess.check_output(
    ['node', os.path.join(HERE, 'oracle.mjs'), json.dumps(AMOUNTS)], cwd=HERE))

if not os.path.exists(BOOK):
    print(f'FAIL: {BOOK} does not exist'); sys.exit(1)

fails = checks = 0
tmp = tempfile.mkdtemp()
for amount in AMOUNTS:
    path = os.path.join(tmp, 'case.xlsx')
    shutil.copy(BOOK, path)
    wb = load_workbook(path); ws = wb['Calculator']
    ws['C6'] = amount; ws['C5'] = 'Alberta'
    wb.save(path)
    res = json.loads(subprocess.check_output([sys.executable, RECALC, path, '60']))
    if res.get('status') != 'success':
        print('FAIL recalc', amount, res); fails += 1; continue
    ws = load_workbook(path, data_only=True)['Calculator']
    # Comparison table: header row 'Code' in column B, find rows by code.
    rows = {ws.cell(r, 2).value: r for r in range(1, ws.max_row + 1)
            if ws.cell(r, 2).value in CODES}
    for code in CODES:
        r = rows.get(code)
        e = expected[str(amount) if str(amount) in expected else repr(amount)][code] \
            if False else expected[next(k for k in expected if float(k) == amount)][code]
        got = {k: ws.cell(r, c).value or 0 for k, c in
               zip(['program','registration','premium','tax','total'], range(4, 9))} if r else {}
        for k, v in e.items():
            checks += 1
            if r is None or abs((got.get(k) or 0) - v) > 0.005:
                fails += 1
                print(f'FAIL {code} ${amount:,} {k}: expected {v}, got {got.get(k)}')
    # The statement for the selected province (Alberta) must match too.
    checks += 1
    total = ws['C16'].value
    if total is None or abs(total - expected[next(k for k in expected if float(k) == amount)]['AB']['total']) > 0.005:
        fails += 1; print(f'FAIL statement total AB ${amount:,}: got {total}')

# Real FCT files (Alberta statement total).
REAL = {815000: 1494, 920000: 1599}
for amount, fee in REAL.items():
    path = os.path.join(tmp, 'real.xlsx'); shutil.copy(BOOK, path)
    wb = load_workbook(path); wb['Calculator']['C5'] = 'Alberta'; wb['Calculator']['C6'] = amount; wb.save(path)
    subprocess.check_output([sys.executable, RECALC, path, '60'])
    got = load_workbook(path, data_only=True)['Calculator']['C16'].value
    checks += 1
    if got != fee:
        fails += 1; print(f'FAIL real FCT file AB ${amount:,}: expected {fee}, got {got}')

# Fee Schedule must be locked against accidental edits.
checks += 1
if not load_workbook(BOOK)['Fee Schedule'].protection.sheet:
    fails += 1; print('FAIL Fee Schedule tab is not protected')

print(f'{checks - fails}/{checks} checks passed')
sys.exit(1 if fails else 0)
