# merge_data.py
import pandas as pd
import zipfile
import json
import os

# 1) Read your Phase 1 directory CSV
phase1 = pd.read_csv("data/phase1.csv", dtype=str)

# Normalize the column name for the Contract Number
phase1 = phase1.rename(columns={
    "Contract\nNumber": "contractId"
})

print("Phase1 columns:", phase1.columns.tolist())
print("Phase1 rows:", len(phase1))

# 2) Load & flatten PBP JSON from the zip
zip_path = "data/pbp_json.zip"
with zipfile.ZipFile(zip_path) as z:
    # assume there's exactly one .json inside
    name = [n for n in z.namelist() if n.lower().endswith(".json")][0]
    with z.open(name) as f:
        pbp_json = json.load(f)

# Flatten: record_path='pbp', bring up contractYear & section
pbp_flat = pd.json_normalize(
    pbp_json,
    record_path=["pbp"],
    meta=["contractYear", "section"],
    errors="ignore"
)

# 3) Rename so we can join
pbp_flat = pbp_flat.rename(columns={
    "pbp.contractId": "contractId",
    "pbp.planId":    "planId"
})

print("PBP flat columns:", pbp_flat.columns.tolist())
print("PBP flat rows:", len(pbp_flat))

# 4) Merge on contractId only
merged = phase1.merge(
    pbp_flat,
    how="left",
    on="contractId",
    validate="m:1"   # many pbp rows per single phase1 row
)

print("Merged rows:", len(merged))
print("Columns in merged:", merged.columns.tolist())

# 5) Save for review
out_path = "data/merged.csv"
merged.to_csv(out_path, index=False)
print(f"Saved merged CSV to {out_path}")
