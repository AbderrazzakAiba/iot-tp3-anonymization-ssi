"""Shared paths and constants for Part A."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_RAW = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
RESULTS = ROOT / "results"
FIGURES = RESULTS / "figures"

# Hourly version of UCI ElectricityLoadDiagrams20112014 from the Monash Time Series Archive
# (Zenodo, DOI 10.5281/zenodo.4656140, CC BY 4.0): 321 clients, 2012-2014, 11.8 MB.
# Used instead of the 250 MB UCI zip, which could not be downloaded reliably.
RAW_URL = "https://zenodo.org/api/records/4656140/files/electricity_hourly_dataset.zip/content"
RAW_ZIP = DATA_RAW / "electricity_hourly_dataset.zip"
RAW_MD5 = "18096614662b02640d265ad2a6a416bd"

HOURLY_CSV = DATA_PROCESSED / "hourly_2014.csv.gz"          # real readings, kWh per hour
HOUSEHOLDS_CSV = DATA_PROCESSED / "households_private.csv"   # utility's internal table (has identifiers)
RELEASE_CSV = DATA_PROCESSED / "release_naive.csv"           # "anonymized" by dropping names only
REGISTER_CSV = DATA_PROCESSED / "public_register.csv"        # second public table used by the attacker
GROUND_TRUTH_CSV = DATA_PROCESSED / "ground_truth_mapping.csv"  # evaluation only, attacker never sees it

YEAR = 2014
SEED = 2026

IDENTIFIERS = ["household_id", "owner_name"]
QUASI_IDENTIFIERS = ["age", "zip", "sex"]
SENSITIVE = ["annual_kwh", "night_share", "occupancy_profile"]

for _p in (DATA_RAW, DATA_PROCESSED, RESULTS, FIGURES):
    _p.mkdir(parents=True, exist_ok=True)
