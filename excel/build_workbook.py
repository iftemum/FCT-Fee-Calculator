"""Builds FCT-Fee-Calculator.xlsx: a formula-driven Excel version of the web calculator.

Run: python3 excel/build_workbook.py
"""
import os
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Protection, Side
from openpyxl.worksheet.datavalidation import DataValidation

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'FCT-Fee-Calculator.xlsx')

FONT = 'Arial'
INK = '1F2937'
MUTED = '6B7280'
ACCENT = '1D4CCC'
f = lambda **kw: Font(name=FONT, size=kw.pop('size', 10), color=kw.pop('color', INK), **kw)
INPUT_FONT = Font(name=FONT, size=12, bold=True, color='0000FF')
INPUT_FILL = PatternFill('solid', fgColor='FFF2CC')
HEAD_FILL = PatternFill('solid', fgColor='E5EBFB')
TOTAL_FILL = PatternFill('solid', fgColor='F3F4F6')
thin = Side(style='thin', color='D1D5DB')
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
MONEY = '$#,##0.00;($#,##0.00);"-"'
AMOUNT = '$#,##0.00'

# Province order (west to east), name, program fee, registration rule, tax on premium.
PROVINCES = [
    ('BC', 'British Columbia', 750.85, 'None', 0),
    ('AB', 'Alberta', 679.00, 'Per $5,000', 0),
    ('SK', 'Saskatchewan', 700.00, 'SK chart', 0.06),
    ('MB', 'Manitoba', 925.00, 'None', 0),
    ('ON', 'Ontario', 898.11, 'None', 0.08),
    ('QC', 'Quebec', 1572.50, 'None', 0.09),
    ('NB', 'New Brunswick', 849.00, 'None', 0),
    ('NS', 'Nova Scotia', 849.00, 'None', 0),
    ('PE', 'Prince Edward Island', 1085.00, 'None', 0),
    ('NL', 'Newfoundland and Labrador', 992.00, 'Per $100', 0.15),
]
N = len(PROVINCES)

wb = Workbook()
calc = wb.active
calc.title = 'Calculator'
sch = wb.create_sheet('Fee Schedule')
S = "'Fee Schedule'!"

# =====================================================================
# Fee Schedule sheet (every number the formulas use lives here)
# =====================================================================
sch['A1'] = 'Fee Schedule'
sch['A1'].font = f(size=14, bold=True)
sch['A2'] = ('Source: TD Broker Refinance Program Fee Schedule, title insured credit applications, '
             'fees current as of November 2, 2026. This tab is locked. To update fees: Review > Unprotect Sheet, edit the blue cells, then Protect Sheet again.')
sch['A2'].font = f(color=MUTED, italic=True)

hdr = ['Code', 'Province', 'Program fee', 'Registration rule', 'Tax on premium', 'Adds premium over $750K']
for c, h in enumerate(hdr, 1):
    cell = sch.cell(3, c, h)
    cell.font = f(bold=True); cell.fill = HEAD_FILL; cell.border = BOX
PROV_FIRST = 4
for i, (code, name, fee, rule, tax) in enumerate(PROVINCES):
    adds = 'No' if code in ('AB', 'NB', 'NS', 'PE') else 'Yes'  # not named in the premium section
    r = PROV_FIRST + i
    for c, v in enumerate([code, name, fee, rule, tax, adds], 1):
        cell = sch.cell(r, c, v); cell.border = BOX; cell.font = f()
    for c in (3, 4, 5, 6):
        sch.cell(r, c).font = f(color='0000FF')
    sch.cell(r, 3).number_format = AMOUNT
    sch.cell(r, 5).number_format = '0%'
PROV_LAST = PROV_FIRST + N - 1
sch.cell(PROV_FIRST + 1, 3).comment = Comment(
    'The Nov 2, 2026 schedule lists Alberta at $679.00. An older funders group-chat formula '
    'adds $664 instead. Change this cell if your manager confirms a different figure.', 'Calculator')

rule_dv = DataValidation(type='list', formula1='"None,Per $5,000,Per $100,SK chart"', allow_blank=False)
sch.add_data_validation(rule_dv)
rule_dv.add(f'D{PROV_FIRST}:D{PROV_LAST}')
yes_no_dv = DataValidation(type='list', formula1='"Yes,No"', allow_blank=False)
sch.add_data_validation(yes_no_dv)
yes_no_dv.add(f'F{PROV_FIRST}:F{PROV_LAST}')
sch.cell(PROV_FIRST + 1, 6).comment = Comment(
    'Only provinces named in the schedule\'s insurance premium section pay it (ON, NF, SK, MB, QC, '
    'and BC above $1M). Alberta confirmed on real FCT files: plan limit $920,000 -> $1,599; '
    '$815,000 -> $1,494.', 'Calculator')

# Rule constants
sch['A16'] = 'Rule constants'; sch['A16'].font = f(size=12, bold=True)
constants = [
    ('Per $5,000 rule (Alberta): fee per block', 5, AMOUNT),
    ('Per $5,000 rule: block size (part of a block counts as a full block)', 5000, '$#,##0'),
    ('Per $100 rule (Newfoundland and Labrador): fee per block', 0.40, AMOUNT),
    ('Per $100 rule: block size (part of a block counts as a full block)', 100, '$#,##0'),
    ('Credit over $5M: fee per block', 0.65, AMOUNT),
    ('Credit over $5M: block size', 1000, '$#,##0'),
    ('Credit over $5M: applies above', 5_000_000, '$#,##0'),
    ('British Columbia pays the premium only above', 1_000_000, '$#,##0'),
]
for i, (label, value, fmt) in enumerate(constants):
    r = 17 + i
    sch.cell(r, 1, label).font = f()
    v = sch.cell(r, 4, value); v.font = f(color='0000FF'); v.number_format = fmt; v.border = BOX
AB_FEE, AB_BLOCK, NL_FEE, NL_BLOCK, OVER_FEE, OVER_BLOCK, OVER_FROM, BC_FROM = (
    f'{S}$D${17 + i}' for i in range(8))

# Saskatchewan chart (lookup by "From")
sch['A27'] = 'Saskatchewan variable registration fees'; sch['A27'].font = f(size=12, bold=True)
for c, h in enumerate(['From', 'To', 'Fee'], 1):
    cell = sch.cell(28, c, h); cell.font = f(bold=True); cell.fill = HEAD_FILL; cell.border = BOX
sk = [(0, '$249,999.99', 200), (250000, '$500,000.00', 275), (500000.01, '$750,000.00', 525),
      (750000.01, '$1,000,000.00', 775), (1000000.01, 'and over', 1000)]
for i, (lo, hi, fee) in enumerate(sk):
    r = 29 + i
    for c, v in enumerate([lo, hi, fee], 1):
        cell = sch.cell(r, c, v); cell.border = BOX; cell.font = f()
    sch.cell(r, 1).number_format = AMOUNT
    sch.cell(r, 3).number_format = AMOUNT; sch.cell(r, 3).font = f(color='0000FF')
SK_TABLE = f'{S}$A$29:$C$33'

# Premium tiers (credit amount)
sch['A36'] = 'Additional title insurance premium (credit amount)'; sch['A36'].font = f(size=12, bold=True)
for c, h in enumerate(['From', 'To', 'Premium'], 1):
    cell = sch.cell(37, c, h); cell.font = f(bold=True); cell.fill = HEAD_FILL; cell.border = BOX
tiers = [(0, '$750,000.00', 0), (750000.01, '$1,000,000.00', 100), (1000000.01, '$1,500,000.00', 250),
         (1500000.01, '$2,000,000.00', 350), (2000000.01, '$5,000,000.00 (then + per-block fee above)', 750)]
for i, (lo, hi, fee) in enumerate(tiers):
    r = 38 + i
    for c, v in enumerate([lo, hi, fee], 1):
        cell = sch.cell(r, c, v); cell.border = BOX; cell.font = f()
    sch.cell(r, 1).number_format = AMOUNT
    sch.cell(r, 3).number_format = AMOUNT; sch.cell(r, 3).font = f(color='0000FF')
TIER_TABLE = f'{S}$A$38:$C$42'

# What the program fee covers
sch['A45'] = 'What the program fee covers'; sch['A45'].font = f(size=12, bold=True)
covers = {
    'Standard (all provinces except Quebec)': [
        'All searches', 'Mortgage or Home Equity FlexLine registration',
        'Unlimited secured and unsecured debt payouts', 'One signing appointment',
        'All discharge registration fees', 'All applicable taxes'],
    'Quebec, no discharge': [
        'Title searches', 'Document preparation', 'One signing appointment',
        'Three (3) unsecured debt payouts', 'Registration', 'Title insurance policy for the lender',
        'All applicable taxes'],
    'Quebec, with discharge': [
        'Title searches', 'Document preparation', 'One signing appointment',
        'Unlimited discharges and unsecured debt payouts', 'Registration and cancellation fees',
        'Title insurance policy for the lender', 'All applicable taxes'],
}
for c, (head, items) in enumerate(covers.items(), 1):
    cell = sch.cell(46, c, head); cell.font = f(bold=True); cell.fill = HEAD_FILL; cell.border = BOX
    for i in range(7):
        cell = sch.cell(47 + i, c, items[i] if i < len(items) else None)
        cell.font = f(); cell.border = BOX
COVERS = f'{S}$A$47:$C$53'

for col, w in zip('ABCDEF', [62, 30, 40, 16, 16, 24]):
    sch.column_dimensions[col].width = w

# =====================================================================
# Calculator sheet
# =====================================================================
calc.sheet_view.showGridLines = False
for col, w in zip('ABCDEFGH', [2, 30, 26, 18, 18, 18, 14, 16]):
    calc.column_dimensions[col].width = w

calc['B2'] = 'FCT Refinance Fee Calculator'
calc['B2'].font = f(size=18, bold=True)
calc['B3'] = 'Broker Refinance Program · fees current as of November 2, 2026 · fill in the yellow cells'
calc['B3'].font = f(color=MUTED)

AMT = 'N($C$6)'  # N() turns text or blanks into 0 so bad input never calculates
VALID = f'{AMT}>0'
SEL_CODE = f'INDEX({S}$A${PROV_FIRST}:$A${PROV_LAST},MATCH($C$5,{S}$B${PROV_FIRST}:$B${PROV_LAST},0))'
SEL_RULE = f'INDEX({S}$D${PROV_FIRST}:$D${PROV_LAST},MATCH($C$5,{S}$B${PROV_FIRST}:$B${PROV_LAST},0))'
SEL_ADDS = f'INDEX({S}$F${PROV_FIRST}:$F${PROV_LAST},MATCH($C$5,{S}$B${PROV_FIRST}:$B${PROV_LAST},0))'
SEL_TAX = f'INDEX({S}$E${PROV_FIRST}:$E${PROV_LAST},MATCH($C$5,{S}$B${PROV_FIRST}:$B${PROV_LAST},0))'

inputs = [
    (5, 'Province', 'Alberta', 'Pick from the list.'),
    (6, 'Mortgage amount (plan limit)', 400000,
     'Example. For a FlexLine, enter the Plan Limit (term + revolving).'),
    (7, 'Quebec refinance type', 'No discharge', 'Quebec only. Same fee; what it covers changes.'),
]
for r, label, value, hint in inputs:
    calc.cell(r, 2, label).font = f(bold=True)
    cell = calc.cell(r, 3, value)
    cell.font = INPUT_FONT; cell.fill = INPUT_FILL; cell.border = BOX
    cell.alignment = Alignment(horizontal='left' if r != 6 else 'right')
    calc.cell(r, 4, hint).font = f(color=MUTED, italic=True, size=9)
calc['C6'].number_format = AMOUNT

prov_dv = DataValidation(type='list', formula1=f'={S}$B${PROV_FIRST}:$B${PROV_LAST}', allow_blank=False,
                         showErrorMessage=True, errorTitle='Province',
                         error='Pick a province from the list.')
amt_dv = DataValidation(type='decimal', operator='greaterThan', formula1='0', showErrorMessage=True,
                        errorTitle='Mortgage amount', error='Enter an amount greater than $0, like 400000.')
qc_dv = DataValidation(type='list', formula1='"No discharge,With discharge"', allow_blank=False)
for dv, ref in ((prov_dv, 'C5'), (amt_dv, 'C6'), (qc_dv, 'C7')):
    calc.add_data_validation(dv); dv.add(ref)

# ---- Fee statement ----
calc['B9'] = 'Fee statement'
calc['B9'].font = f(size=13, bold=True)
calc['C9'] = f'=IF({VALID},$C$5&"  ·  "&TEXT({AMT},"$#,##0.00")&" mortgage","")'
calc['C9'].font = f(color=MUTED)
for c in range(2, 6):
    calc.cell(9, c).border = Border(bottom=Side(style='medium', color=INK))

CMP_FIRST = 30  # comparison table first data row
CMP_LAST = CMP_FIRST + N - 1
def pick(col):
    return (f'=IF({VALID},INDEX(${col}${CMP_FIRST}:${col}${CMP_LAST},'
            f'MATCH($C$5,$C${CMP_FIRST}:$C${CMP_LAST},0)),"")')

AB_BLOCKS = f'ROUNDUP(ROUND({AMT}/{AB_BLOCK},6),0)'
NL_BLOCKS = f'ROUNDUP(ROUND({AMT}/{NL_BLOCK},6),0)'
OVER_BLOCKS = f'ROUNDUP(ROUND(({AMT}-{OVER_FROM})/{OVER_BLOCK},6),0)'
lines = [
    (10, 'Program fee', pick('D'),
     f'=IF({VALID},IF($C$5="Quebec","Quebec, "&LOWER($C$7),"Flat fee for "&$C$5),"")'),
    (11, 'Registration fee', pick('E'),
     f'=IF(NOT({VALID}),"",IF({SEL_RULE}="Per $5,000",TEXT({AB_FEE},"$0")&" × "&TEXT({AB_BLOCKS},"#,##0")'
     f'&" blocks of "&TEXT({AB_BLOCK},"$#,##0"),IF({SEL_RULE}="Per $100",TEXT({NL_FEE},"$0.00")&" × "'
     f'&TEXT({NL_BLOCKS},"#,##0")&" blocks of "&TEXT({NL_BLOCK},"$#,##0"),IF({SEL_RULE}="SK chart",'
     f'"Saskatchewan registration chart","No registration fee"))))'),
    (12, 'Additional insurance premium', pick('F'),
     f'=IF(NOT({VALID}),"",IF(N(C12)=0,IF(AND({SEL_ADDS}="No",{AMT}>750000),"FCT does not add this premium in "&$C$5,IF(AND($C$5="British Columbia",{AMT}>750000),'
     f'"BC pays only above "&TEXT({BC_FROM},"$#,##0"),"Only for credit over $750,000")),'
     f'IF({AMT}>{OVER_FROM},"$750 + "&TEXT({OVER_FEE},"$0.00")&" × "&TEXT({OVER_BLOCKS},"#,##0")'
     f'&" blocks of "&TEXT({OVER_BLOCK},"$#,##0")&" over $5M","Tier for "&TEXT({AMT},"$#,##0")&" (see Fee Schedule)")))'),
    (13, 'Tax on premium', pick('G'),
     f'=IF(NOT({VALID}),"",IF(N(C13)=0,"None","{0}"&TEXT({SEL_TAX},"0%")&" of premium"))'.replace('{0}', '')),
]
for r, label, formula, detail in lines:
    calc.cell(r, 2, label).font = f()
    cell = calc.cell(r, 3, formula); cell.number_format = MONEY; cell.font = f(size=11)
    calc.cell(r, 4, detail).font = f(color=MUTED, size=9)
    for c in range(2, 6):
        calc.cell(r, c).border = Border(bottom=Side(style='hair', color='D1D5DB'))

calc['B16'] = 'TOTAL FCT FEE'
calc['B16'].font = f(size=13, bold=True)
calc['C16'] = pick('H')
calc['C16'].font = f(size=16, bold=True, color=ACCENT)
calc['C16'].number_format = MONEY
for c in range(2, 6):
    cell = calc.cell(16, c)
    cell.fill = TOTAL_FILL
    cell.border = Border(top=Side(style='thin', color=INK), bottom=Side(style='double', color=INK))
calc.row_dimensions[16].height = 26

calc['B17'] = (f'=IF(NOT(ISNUMBER($C$6)),"Enter the mortgage amount in C6 (numbers only, like 400000).",'
               f'IF($C$6<=0,"The mortgage amount must be greater than $0.",'
               f'IF($C$6>{OVER_FROM},"Above $5,000,000 the tax on the premium varies by province. Confirm before quoting.","")))')
calc['B17'].font = f(color='B42318', bold=True)

# ---- What it covers ----
calc['B19'] = 'What the program fee covers'
calc['B19'].font = f(size=11, bold=True)
COVER_COL = f'IF($C$5="Quebec",IF($C$7="With discharge",3,2),1)'
for i in range(7):
    r = 20 + i
    calc.cell(r, 2, f'=IF(INDEX({COVERS},{i + 1},{COVER_COL})="","","•  "&INDEX({COVERS},{i + 1},{COVER_COL}))').font = f()

# ---- Comparison table ----
calc['B28'] = f'=IF({VALID},"Every province at "&TEXT({AMT},"$#,##0.00"),"Every province")'
calc['B28'].font = f(size=13, bold=True)
heads = ['Code', 'Province', 'Program fee', 'Registration', 'Premium', 'Tax on premium', 'Total']
for c, h in enumerate(heads, 2):
    cell = calc.cell(29, c, h); cell.font = f(bold=True); cell.fill = HEAD_FILL; cell.border = BOX
    cell.alignment = Alignment(horizontal='left' if c <= 3 else 'right')

for i in range(N):
    r = CMP_FIRST + i
    s = PROV_FIRST + i
    rule, tax, adds = f'{S}$D${s}', f'{S}$E${s}', f'{S}$F${s}'
    calc.cell(r, 2, f'={S}A{s}')
    calc.cell(r, 3, f'={S}B{s}')
    calc.cell(r, 4, f'=IF({VALID},{S}C{s},"")')
    calc.cell(r, 5, f'=IF({VALID},ROUND(IF({rule}="Per $5,000",{AB_BLOCKS}*{AB_FEE},'
                    f'IF({rule}="Per $100",{NL_BLOCKS}*{NL_FEE},'
                    f'IF({rule}="SK chart",VLOOKUP({AMT},{SK_TABLE},3,TRUE),0))),2),"")')
    calc.cell(r, 6, f'=IF({VALID},ROUND(IF(OR({adds}="No",AND(B{r}="BC",{AMT}<={BC_FROM})),0,'
                    f'VLOOKUP({AMT},{TIER_TABLE},3,TRUE)+IF({AMT}>{OVER_FROM},{OVER_BLOCKS}*{OVER_FEE},0)),2),"")')
    calc.cell(r, 7, f'=IF({VALID},ROUND(F{r}*{tax},2),"")')
    calc.cell(r, 8, f'=IF({VALID},D{r}+E{r}+F{r}+G{r},"")')
    for c in range(2, 9):
        cell = calc.cell(r, c)
        cell.border = BOX
        cell.font = f(bold=(c == 8))
        if c >= 4:
            cell.number_format = MONEY
calc.conditional_formatting.add(
    f'B{CMP_FIRST}:H{CMP_LAST}',
    FormulaRule(formula=[f'$C{CMP_FIRST}=$C$5'], fill=PatternFill('solid', fgColor='DCE6FF'),
                font=Font(name=FONT, bold=True, color=ACCENT)))

calc['B41'] = ('Unofficial tool. Built from the TD Broker Refinance Program fee schedule (fees current as of '
               'November 2, 2026, subject to change without notice). Confirm against the current schedule '
               'before quoting. Partial blocks count as full blocks (e.g. $312,500 in Alberta = 63 blocks of $5,000).')
calc['B41'].font = f(color=MUTED, italic=True, size=9)
calc['B41'].alignment = Alignment(wrap_text=True, vertical='top')
calc.merge_cells('B41:H42')
calc.row_dimensions[41].height = 22
calc.row_dimensions[42].height = 22

# Protect formulas; leave the three inputs editable (no password).
for ref in ('C5', 'C6', 'C7'):
    calc[ref].protection = Protection(locked=False)
calc.protection.sheet = True
# Lock the whole Fee Schedule tab against accidental edits. No password, so the
# owner can change fees with Review > Unprotect Sheet (or add a password there).
sch.protection.sheet = True
calc.protection.formatCells = False
calc.protection.formatColumns = False

calc.page_setup.orientation = 'portrait'
calc.page_setup.fitToWidth = 1
calc.sheet_properties.pageSetUpPr.fitToPage = True
calc.print_area = 'B2:H42'
wb.active = 0
wb.save(OUT)
print('Saved', OUT)
