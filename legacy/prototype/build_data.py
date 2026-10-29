import pandas as pd, re, json, sys
SRC = sys.argv[1]; OUT = 'data.json'
df = pd.read_csv(SRC)
def num(v):
    if pd.isna(v): return None
    s = str(v).strip().replace(',', '.')
    s = s.lstrip('<')
    if s.count('.') > 1: return None
    try: return float(s)
    except: return None
SWEET = re.compile(r'sucralose|aspartame|acesulfame|saccharin|steviol|stevia|sweetener|\b9(50|51|55|60)\b|\b4(?:69|68)\b', re.I)
FV = re.compile(r'fruit|juice|pulp|puree|vegetable|tomato|mango|apple|orange|banana|berry|potato|onion|carrot|pea|bean|lentil|dal|chickpea|legume|pomegranate|lychee|guava|grape|pineapple|coconut', re.I)
def fvl(ing):
    tot = 0
    for m in re.finditer(r'([A-Za-z][A-Za-z \-&]{2,40})\s*\(?\s*(\d{1,3}(?:\.\d+)?)\s*%', str(ing)):
        if FV.search(m.group(1)) and float(m.group(2)) <= 100: tot += float(m.group(2))
    if re.search(r'100\s*%\s*(fruit|juice|pure)', str(ing), re.I): tot = 100
    return min(tot, 100)
rows, st = [], dict(scaled=0, assumed100=0, dropped=0)
for i, r in df.iterrows():
    f = {k: num(r[c]) for k, c in dict(kcal='Calories_kcal', carb='Carbohydrates_g', prot='Proteins_g', fat='Total_Fat_g', sat='Saturated_Fat_g', sugar='Sugar_g', sodium='Sodium_mg', fiber='Dietary_Fiber_g').items()}
    if any(f[k] is None for k in ('kcal', 'prot', 'sat', 'sugar', 'sodium')): st['dropped'] += 1; continue
    f['fiber'] = f['fiber'] or 0
    srv = r['Serving_Size_g']; notes = []
    if srv and srv < 100:
        macros = (f['carb'] or 0) + f['prot'] + (f['fat'] or 0)
        if macros <= srv * 1.1:                      # values fit inside one serving -> per-serving data
            k = 100 / srv
            for x in ('kcal','carb','prot','fat','sat','sugar','sodium','fiber'):
                if f[x] is not None: f[x] = round(f[x] * k, 2)
            st['scaled'] += 1; notes.append(f'Values were per {srv:g} g serving; converted to per 100 g.')
        else: st['assumed100'] += 1
    elif srv and srv > 100: notes.append(f'Serving size listed as {srv:g} g; values assumed per 100 g.')
    if f['sodium'] > 4000: notes.append('Sodium looks unusually high - check source data.')
    name = re.sub(r'[\u00ae\u2122\xa0]', ' ', str(r['Item name'])); name = re.sub(r'\s+', ' ', name).strip()
    ing = str(r['Ingredients'])
    rows.append(dict(id=int(r['S.No']), name=name, brand=str(r['Brand_Name']).title(), cat=r['Category'], sub=r['Sub_Category'],
        bev=(r['Category'] == 'JUICE'), sweet=bool(SWEET.search(ing)) and r['Category'] == 'JUICE', fvl=round(fvl(ing)),
        ing=ing[:400], price=None if pd.isna(r['Price_INR']) else r['Price_INR'], notes=notes, **{k: f[k] for k in f}))
json.dump(rows, open(OUT, 'w'), separators=(',', ':'))
print(len(rows), 'products kept;', st)
