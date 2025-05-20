#!/usr/bin/env python3
import os
import sys
import json
import zipfile
import pandas as pd

print("Starting merge process…", file=sys.stdout)

# 1) Paths
DATA_DIR    = 'data'
PHASE1_CSV  = os.path.join(DATA_DIR, 'phase1.csv')
PBP_ZIP     = os.path.join(DATA_DIR, 'pbp_json.zip')
OUTPUT_CSV  = os.path.join(DATA_DIR, 'merged_with_benefits_full.csv')

# 2) Load Phase-1 CSV
print(f"Loading Phase-1 data from {PHASE1_CSV}", file=sys.stdout)
phase1_df = pd.read_csv(PHASE1_CSV, dtype=str)

# 3) Code → Description lookup
#    Fill this out completely from your Readme_PBP_Benefits_2025.txt
CODE_DESCRIPTIONS = {
    "1a": "Inpatient hospital copay",
    "1b": "Inpatient hospital coinsurance",
    "2":  "Skilled nursing facility copay",
    "3-1":"Part B physician visit copay",
    "3-2":"Specialist visit copay",
    "4":  "Emergency or urgent care copay",
    "5":  "Partial hospitalization copay",
    "6":  "Home health care copay",
    "7a": "Primary care physician copay",
    "7b": "Chiropractic copay",
    "7f": "Podiatry copay",
    "8":  "Outpatient clinical lab copay",
    "9":  "Outpatient hospital copay",
    "10": "Ambulance/transport copay",
    "15": "Part B drugs coinsurance",
    "16": "Dental benefits",
    "17": "Eye exams and eyewear",
    "18": "Hearing exams and hearing aids",
    "20": "Enhanced Rx data for cost plans",
    # …and so on. Add every categoryCode you need based on the Readme :contentReference[oaicite:1]{index=1}
}

# 4) Safe nested-get helper
def get_nested(obj, path, default=None):
    """
    Safely walk obj[path[0]][path[1]]…; if anything is missing or not a dict, returns default.
    """
    for key in path:
        if not isinstance(obj, dict):
            return default
        obj = obj.get(key)
        if obj is None:
            return default
    return obj

# 5) Open PBP JSON archive
print(f"Opening PBP JSON archive {PBP_ZIP}", file=sys.stdout)
zf = zipfile.ZipFile(PBP_ZIP)

records = []
total = len([n for n in zf.namelist() if n.lower().endswith('.json')])
counter = 0

for fname in zf.namelist():
    if not fname.lower().endswith('.json'):
        continue
    counter += 1
    print(f"[{counter}/{total}] {fname}", file=sys.stderr)

    with zf.open(fname) as f:
        try:
            blob = json.load(f)
        except Exception as e:
            print(f"  ‼️ JSON decode error in {fname}: {e}", file=sys.stderr)
            continue

    for pbp in blob.get('pbp', []):
        contract = pbp.get('contractId')
        planChar = pbp.get('planCharacteristics', {})
        base = {
            'contractId':   contract,
            'planId':       pbp.get('planId'),
            'planName':     planChar.get('planName'),
        }

        # Medicare offerings
        for item in get_nested(pbp, ['benefitOfferings','medicare','medicareBenefitOfferingDetails'], []):
            code = item.get('categoryCode')
            records.append({
                **base,
                'categoryCode': code,
                'description':  CODE_DESCRIPTIONS.get(code, ''),
                'inNetwork':    item.get('boInNetwork'),
                'minValue':     item.get('boMinValue'),
                'maxValue':     item.get('boMaxValue'),
                'valueAmount':  item.get('blValueAmt'),
                'groupCode':    item.get('boCostShareGroupCode'),
                'vbidEPSDT':    item.get('vbidEPSDT'),
            })

        # Non-Medicare offerings
        for item in get_nested(pbp, ['benefitOfferings','nonMedicare','nonMedicareBenefitOfferingDetails'], []):
            code = item.get('categoryCode')
            records.append({
                **base,
                'categoryCode': code,
                'description':  CODE_DESCRIPTIONS.get(code, ''),
                'inNetworkOption': item.get('inNetworkOptionSelected'),
                'inNetwork':       item.get('boInNetwork'),
                'minValue':        item.get('boMinValue'),
                'maxValue':        item.get('boMaxValue'),
                'valueAmount':     item.get('blValueAmt'),
                'groupCode':       item.get('boCostShareGroupCode'),
            })

zf.close()

# 6) Build flat DataFrame
print("Building benefit DataFrame…", file=sys.stdout)
benefits_df = pd.DataFrame.from_records(records)
print(f"  → {len(benefits_df)} total benefit rows", file=sys.stdout)

# 7) Merge back to phase1
print("Merging with Phase-1…", file=sys.stdout)
merged = phase1_df.merge(
    benefits_df,
    how='left',
    left_on='Contract\nNumber',   # adjust if your CSV header is different
    right_on='contractId'
)
print(f"  → {len(merged)} rows after merge", file=sys.stdout)

# 8) Write out
print(f"Writing full result to {OUTPUT_CSV}", file=sys.stdout)
merged.to_csv(OUTPUT_CSV, index=False)

print("Done.", file=sys.stdout)

