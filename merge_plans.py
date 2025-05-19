#!/usr/bin/env python3

import zipfile, os
import pandas as pd

# --- Paths (adjust if yours differ) ---
PBP_ZIP    = os.path.join("data", "pbp.zip")
PHASE1_CSV = os.path.join("data", "phase1.csv")
OUTPUT_CSV = os.path.join("data", "phase2.csv")
OUTPUT_JSON= os.path.join("data", "phase2.json")

# --- 1. Extract the BasicBenefits CSV from the ZIP ---
with zipfile.ZipFile(PBP_ZIP, 'r') as z:
    csv_name = next(fn for fn in z.namelist() if "BasicBenefits" in fn)
    z.extract(csv_name, "data/tmp_pbp/")

# --- 2. Load PBP and your Phase-1 data ---
pbp_df    = pd.read_csv(os.path.join("data/tmp_pbp", csv_name), dtype=str)
phase1_df = pd.read_csv(PHASE1_CSV, dtype=str)

# --- 3. Merge on PLAN_ID ---
merged = phase1_df.merge(
    pbp_df[[
        "PLAN_ID", "PART_B_GIVEBACK", "LIS_FLAG",
        "DENTAL_BENEFIT", "VISION_BENEFIT", "OTC_ALLOWANCE"
    ]],
    left_on="plan_id",
    right_on="PLAN_ID",
    how="left"
)

# --- 4. Write out the enriched files ---
merged.to_csv(OUTPUT_CSV, index=False)
merged.to_json(OUTPUT_JSON, orient="records", lines=False)

print(f"✅ Merged {len(merged)} plans → {OUTPUT_CSV}, {OUTPUT_JSON}")
