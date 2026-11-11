"""Build the Part A working tables from the UCI ElectricityLoadDiagrams20112014 dataset.

Real data (reused):  hourly load of 321 Portuguese electricity clients, 2012-2014
                     (UCI dataset 321, hourly version from the Monash archive on Zenodo).
Synthetic (built):   owner demographics (name, age, sex, postal code) and a second
                     "public register". The UCI release has no demographics, so we
                     simulate the scenario the TP describes: a utility publishes a
                     per-household table that still contains quasi-identifiers.

Outputs (data/processed/):
    hourly_2014.csv.gz        real hourly consumption (kWh) per kept client
    households_private.csv    utility's internal table, identifiers included
    release_naive.csv         "anonymized" by dropping identifiers only
    public_register.csv       second public table (e.g. municipal / electoral roll)
    ground_truth_mapping.csv  record_id -> owner_name, for scoring the attack only
"""
from __future__ import annotations

import hashlib
import string
import sys
import urllib.request
import zipfile

import numpy as np
import pandas as pd

from part_a import config as C

FIRST_M = ["Joao", "Jose", "Antonio", "Manuel", "Francisco", "Rui", "Pedro", "Paulo", "Carlos",
           "Luis", "Miguel", "Tiago", "Nuno", "Ricardo", "Bruno", "Andre", "Diogo", "Hugo"]
FIRST_F = ["Maria", "Ana", "Joana", "Sofia", "Ines", "Rita", "Catarina", "Marta", "Beatriz",
           "Carla", "Sara", "Patricia", "Teresa", "Helena", "Claudia", "Filipa", "Lucia", "Raquel"]
SURNAMES = ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins",
            "Jesus", "Sousa", "Fernandes", "Goncalves", "Gomes", "Lopes", "Marques", "Alves",
            "Almeida", "Ribeiro", "Pinto", "Carvalho", "Teixeira", "Moreira", "Correia", "Mendes"]
# Portuguese 4-digit postal prefixes (CP4), Lisbon metropolitan area.
ZIPS = ["1000", "1050", "1069", "1100", "1150", "1170", "1200", "1250", "1300", "1350",
        "1400", "1495", "1500", "1600", "1700", "1750", "1800", "1900", "2600", "2610",
        "2700", "2720", "2780", "2790", "2800"]

REGISTER_SIZE = 2000  # people in the public register (meter owners + other residents)


# --------------------------------------------------------------------------- real data
def _md5(path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download_raw() -> None:
    if not C.RAW_ZIP.exists():
        print(f"Downloading {C.RAW_URL} (11.8 MB) ...")
        urllib.request.urlretrieve(C.RAW_URL, C.RAW_ZIP)
    if _md5(C.RAW_ZIP) != C.RAW_MD5:
        raise RuntimeError(f"{C.RAW_ZIP} has a wrong MD5: delete it and run again")


def read_tsf(path) -> pd.DataFrame:
    """Parse the Monash .tsf file: one line per client  'T1:2012-01-01 00-00-01:v1,v2,...'."""
    series = {}
    with zipfile.ZipFile(path) as zf, zf.open("electricity_hourly_dataset.tsf") as fh:
        in_data = False
        for line in fh:
            line = line.decode("latin-1").strip()
            if not in_data:
                in_data = line.lower() == "@data"
                continue
            name, start, values = line.split(":", 2)
            series[name] = np.array(values.split(","), dtype="float32")
    start = pd.Timestamp(start.replace("-", ":").replace(":", "-", 2)).floor("h")
    index = pd.date_range(start, periods=len(next(iter(series.values()))), freq="h")
    return pd.DataFrame(series, index=index)


def load_hourly(year: int = C.YEAR) -> pd.DataFrame:
    """Return hourly energy (kWh) per client for one year."""
    raw = read_tsf(C.RAW_ZIP)
    # The archive sums the four 15-min kW readings of each hour (Lai et al. 2017).
    # Energy in that hour = sum(kW) * 0.25 h, i.e. value / 4 = kWh.
    hourly = raw.loc[str(year)] / 4
    # Keep clients that were connected the whole year (< 5 % zero hours).
    active = (hourly == 0).mean() < 0.05
    hourly = hourly.loc[:, active].astype("float32")
    hourly.index.name = "timestamp"
    return hourly


# ------------------------------------------------------------------ derived sensitive attrs
def consumption_features(hourly: pd.DataFrame) -> pd.DataFrame:
    """Per-client sensitive attributes derived from the real readings."""
    hour = hourly.index.hour
    weekday = hourly.index.day_of_week < 5
    total = hourly.sum()
    night = hourly[(hour >= 0) & (hour < 6)].sum() / total
    work = hourly[weekday & (hour >= 9) & (hour < 17)].sum() / hourly[weekday].sum()
    evening = hourly[(hour >= 18) & (hour < 24)].sum() / total

    # Share of consumption a constant load would put in each window, used as reference.
    ref_night, ref_work, ref_evening = 6 / 24, 8 / 24, 6 / 24
    profile = np.where(night > ref_night * 1.15, "night_heavy",
              np.where(work > ref_work * 1.25, "daytime_active",
              np.where(evening > ref_evening * 1.15, "evening_peak", "flat")))
    return pd.DataFrame({
        "household_id": hourly.columns,
        "annual_kwh": total.round(0).to_numpy(),
        "night_share": night.round(3).to_numpy(),
        "occupancy_profile": profile,
    })


# ------------------------------------------------------------------ synthetic demographics
def _people(rng: np.random.Generator, n: int, used_names: set[str]) -> pd.DataFrame:
    sex = rng.choice(["M", "F"], size=n)
    age = np.clip(rng.normal(50, 17, size=n).round(), 18, 92).astype(int)
    weights = 1 / np.arange(1, len(ZIPS) + 1) ** 0.6        # a few dense districts, many sparse
    zips = rng.choice(ZIPS, size=n, p=weights / weights.sum())
    names = []
    for s in sex:
        while True:
            first = rng.choice(FIRST_M if s == "M" else FIRST_F)
            last = " ".join(rng.choice(SURNAMES, size=2, replace=False))
            name = f"{first} {last}"
            if name in used_names:  # rare: add a middle initial
                name = f"{first} {rng.choice(list(string.ascii_uppercase))}. {last}"
            if name not in used_names:
                used_names.add(name)
                names.append(name)
                break
    return pd.DataFrame({"owner_name": names, "age": age, "sex": sex, "zip": zips})


def build_tables(hourly: pd.DataFrame, seed: int = C.SEED) -> dict[str, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    used: set[str] = set()
    feats = consumption_features(hourly)
    owners = _people(rng, len(feats), used)
    households = pd.concat([feats[["household_id"]], owners,
                            feats.drop(columns="household_id")], axis=1)

    others = _people(rng, REGISTER_SIZE - len(households), used)
    register = (pd.concat([households[["owner_name", "age", "sex", "zip"]], others])
                .rename(columns={"owner_name": "full_name"})
                .sample(frac=1, random_state=seed).reset_index(drop=True))

    shuffled = households.sample(frac=1, random_state=seed + 1).reset_index(drop=True)
    shuffled.insert(0, "record_id", [f"r{i:04d}" for i in range(len(shuffled))])
    release = shuffled.drop(columns=C.IDENTIFIERS)
    truth = shuffled[["record_id", "owner_name", "household_id"]]
    return {"households": households, "register": register, "release": release, "truth": truth}


def main() -> None:
    download_raw()
    print("Reading the hourly archive ...")
    hourly = load_hourly()
    print(f"Kept {hourly.shape[1]} clients active all of {C.YEAR}, {hourly.shape[0]} hours")
    hourly.round(3).to_csv(C.HOURLY_CSV)

    t = build_tables(hourly)
    t["households"].to_csv(C.HOUSEHOLDS_CSV, index=False)
    t["release"].to_csv(C.RELEASE_CSV, index=False)
    t["register"].to_csv(C.REGISTER_CSV, index=False)
    t["truth"].to_csv(C.GROUND_TRUTH_CSV, index=False)
    print(t["households"]["occupancy_profile"].value_counts().to_string())
    print("Tables written to", C.DATA_PROCESSED)


if __name__ == "__main__":
    sys.exit(main())
