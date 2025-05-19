import pandas as pd

# Load your two datasets (adjust paths and file types as needed)
phase1_df = pd.read_csv('data/phase1.csv')    # or pd.read_json('data/phase1.json', lines=True)
phase2_df = pd.read_csv('data/phase2.csv')    # or pd.read_json('data/phase2.json', lines=True)

# Debug: print out column names so you can confirm the join keys
print("Phase1 columns:", phase1_df.columns.tolist())
print("Phase2 columns:", phase2_df.columns.tolist())

# If one side uses camelCase and the other snake_case, rename accordingly
# Example: unify on 'planId'
# Uncomment/adjust if needed:
# phase1_df.rename(columns={'planId': 'plan_id'}, inplace=True)
# phase2_df.rename(columns={'planId': 'plan_id'}, inplace=True)

# Perform the merge on the correct key (e.g. 'planId')
merged = phase1_df.merge(
    phase2_df,
    on='planId',              # change to the actual common column name
    how='left',               # choose 'left', 'inner', etc. as appropriate
    suffixes=('_phase1', '_phase2')
)

# Inspect merge result
print("Merged DataFrame shape:", merged.shape)
print("Merged columns:", merged.columns.tolist())

# Save or further process
merged.to_csv('data/merged_output.csv', index=False)
print("Saved merged_output.csv")

