"""Linkage (re-identification) attack: join the released table with a public register.

The attacker sees only release_naive.csv (no names) and public_register.csv (names + the
same quasi-identifiers). Records whose quasi-identifier combination matches exactly one
person in the register are re-identified. ground_truth_mapping.csv is used only to score
whether those claims are correct.
"""
from __future__ import annotations

import json
from typing import Callable

import pandas as pd

from part_a import config as C


def link(release: pd.DataFrame, register: pd.DataFrame, qis: list[str],
         generalize_register: Callable[[pd.DataFrame], pd.DataFrame] | None = None
         ) -> pd.DataFrame:
    """Return one row per released record that matches exactly one register entry.

    If the release is generalized, `generalize_register` maps the register's exact
    values to the same generalization so the join still works.
    """
    reg = register.copy()
    if generalize_register is not None:
        reg = generalize_register(reg)
    rel = release.copy()
    for q in qis:  # compare as strings so "34" and 34 or "[30-39]" join consistently
        rel[q] = rel[q].astype(str)
        reg[q] = reg[q].astype(str)
    merged = rel.merge(reg[qis + ["full_name"]], on=qis, how="inner")
    candidates = merged.groupby("record_id")["full_name"].transform("size")
    return merged.loc[candidates == 1].reset_index(drop=True)


def score(matches: pd.DataFrame, truth: pd.DataFrame, n_released: int) -> dict:
    joined = matches.merge(truth, on="record_id")
    correct = int((joined["full_name"] == joined["owner_name"]).sum())
    return {
        "released_records": n_released,
        "unique_matches": int(len(matches)),
        "correct_reidentifications": correct,
        "reidentification_rate": round(correct / n_released, 4) if n_released else 0.0,
    }


def uniqueness(release: pd.DataFrame, qis: list[str]) -> dict:
    """How many released records are unique on the QIs inside the release itself."""
    sizes = release.groupby(qis, observed=True)["record_id"].transform("size")
    return {"unique_in_release": int((sizes == 1).sum()),
            "unique_share": round(float((sizes == 1).mean()), 4)}


def main() -> dict:
    release = pd.read_csv(C.RELEASE_CSV, dtype={"zip": str})
    register = pd.read_csv(C.REGISTER_CSV, dtype={"zip": str})
    truth = pd.read_csv(C.GROUND_TRUTH_CSV)

    results = {}
    for qis in (["zip"], ["age", "sex"], ["age", "zip"], C.QUASI_IDENTIFIERS):
        m = link(release, register, qis)
        results["+".join(qis)] = {**score(m, truth, len(release)), **uniqueness(release, qis)}

    full = link(release, register, C.QUASI_IDENTIFIERS).merge(truth, on="record_id")
    full = full[full["full_name"] == full["owner_name"]]
    example = full[["record_id", "age", "sex", "zip", "full_name",
                    "annual_kwh", "night_share", "occupancy_profile"]].head(8)
    example.to_csv(C.RESULTS / "linkage_examples.csv", index=False)
    (C.RESULTS / "linkage_attack.json").write_text(json.dumps(results, indent=2))

    print("Linkage attack on the naive release (identifiers removed only)")
    print(pd.DataFrame(results).T.to_string())
    print("\nExamples of re-identified households (name recovered + sensitive data):")
    print(example.to_string(index=False))
    return results


if __name__ == "__main__":
    main()
