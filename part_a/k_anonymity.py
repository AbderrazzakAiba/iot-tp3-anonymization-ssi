"""k-anonymity by full-domain generalization + suppression (k = 2, 5, 10).

Built here: generalization hierarchies, an exhaustive search of the generalization
lattice (the idea behind ARX's optimal search, feasible because the lattice has only
5 x 5 x 2 = 50 nodes), suppression of small classes, and information-loss metrics.
Reused: pycanon independently checks k-anonymity and l-diversity of each output.
"""
from __future__ import annotations

import itertools
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from pycanon import anonymity

from part_a import config as C
from part_a.linkage_attack import link, score

AGE_WIDTHS = [1, 5, 10, 20, None]      # level 0..4 (None = fully suppressed "*")
ZIP_LEVELS = 5                          # 1000 -> 100* -> 10** -> 1*** -> ****
SEX_LEVELS = 2                          # M -> *
MAX_SUPPRESSION = 0.05                  # at most 5 % of records may be suppressed
K_VALUES = [1, 2, 3, 4, 5, 7, 10, 15, 20]
K_REQUIRED = [2, 5, 10]


# ------------------------------------------------------------------ hierarchies
def gen_age(age: pd.Series, level: int) -> pd.Series:
    w = AGE_WIDTHS[level]
    if w is None:
        return pd.Series("*", index=age.index)
    if w == 1:
        return age.astype(int).astype(str)
    lo = (age.astype(int) // w) * w
    return "[" + lo.astype(str) + "-" + (lo + w - 1).astype(str) + "]"


def gen_zip(z: pd.Series, level: int) -> pd.Series:
    z = z.astype(str)
    return z if level == 0 else z.str[: 4 - level] + "*" * level


def gen_sex(s: pd.Series, level: int) -> pd.Series:
    return s.astype(str) if level == 0 else pd.Series("*", index=s.index)


def generalize(df: pd.DataFrame, node: tuple[int, int, int]) -> pd.DataFrame:
    out = df.copy()
    out["age"] = gen_age(df["age"], node[0])
    out["zip"] = gen_zip(df["zip"], node[1])
    out["sex"] = gen_sex(df["sex"], node[2])
    return out


# ------------------------------------------------------------------ information loss
def ncp_per_record(df: pd.DataFrame, node: tuple[int, int, int]) -> np.ndarray:
    """Normalized Certainty Penalty, averaged over the 3 QIs, for each record (0..1)."""
    age_range = df["age"].max() - df["age"].min()
    w = AGE_WIDTHS[node[0]]
    ncp_age = 1.0 if w is None else min((w - 1) / age_range, 1.0)

    domain = sorted(df["zip"].astype(str).unique())
    prefix_len = 4 - node[1]
    covered = pd.Series(domain).str[:prefix_len].value_counts()
    per_zip = df["zip"].astype(str).str[:prefix_len].map(covered).to_numpy()
    ncp_zip = (per_zip - 1) / (len(domain) - 1)

    ncp_sex = float(node[2] == 1)
    return (ncp_age + ncp_zip + ncp_sex) / 3


def evaluate_node(df: pd.DataFrame, node, k: int) -> dict:
    g = generalize(df, node)
    sizes = g.groupby(C.QUASI_IDENTIFIERS)["record_id"].transform("size")
    keep = sizes >= k
    n = len(df)
    ncp = ncp_per_record(df, node)
    ncp[~keep.to_numpy()] = 1.0                       # suppressed record = everything lost
    class_sizes = g[keep].groupby(C.QUASI_IDENTIFIERS).size()
    dm = float((class_sizes ** 2).sum() + (~keep).sum() * n)
    return {
        "node": node,
        "suppressed": int((~keep).sum()),
        "suppression_rate": float((~keep).mean()),
        "ncp_loss": float(ncp.mean()),
        "discernibility_norm": dm / n ** 2,
        "n_classes": int(len(class_sizes)),
        "avg_class_size": float(class_sizes.mean()) if len(class_sizes) else 0.0,
        "_table": g[keep],
    }


def anonymize(df: pd.DataFrame, k: int, max_suppression: float = MAX_SUPPRESSION):
    """Return (anonymized table, metrics) for the lattice node with the least NCP loss."""
    best = None
    lattice = itertools.product(range(len(AGE_WIDTHS)), range(ZIP_LEVELS), range(SEX_LEVELS))
    for node in lattice:
        r = evaluate_node(df, node, k)
        if r["suppression_rate"] > max_suppression:
            continue
        key = (r["ncp_loss"], sum(node))
        if best is None or key < best[0]:
            best = (key, r)
    result = best[1]
    table = result.pop("_table").reset_index(drop=True)
    return table, result


# ------------------------------------------------------------------ privacy checks
def privacy_metrics(anon: pd.DataFrame, register: pd.DataFrame, truth: pd.DataFrame,
                    node, n_released: int) -> dict:
    qis = C.QUASI_IDENTIFIERS
    sizes = anon.groupby(qis)["record_id"].transform("size")
    profiles = anon.groupby(qis)["occupancy_profile"].transform("nunique")
    matches = link(anon, register, qis, generalize_register=lambda r: generalize(r, node))
    s = score(matches, truth, n_released)
    return {
        "pycanon_k": int(anonymity.k_anonymity(anon, qis)),
        "pycanon_l_occupancy": int(anonymity.l_diversity(anon, qis, ["occupancy_profile"])),
        "max_prosecutor_risk": float((1 / sizes).max()),
        "avg_prosecutor_risk": float((1 / sizes).mean()),
        "homogeneous_share": float((profiles == 1).mean()),   # sensitive value leaks (l = 1)
        "linkage_unique_matches": s["unique_matches"],
        "linkage_correct": s["correct_reidentifications"],
        "linkage_rate": s["reidentification_rate"],
    }


def describe_node(node) -> str:
    w = AGE_WIDTHS[node[0]]
    age = "exact" if w == 1 else ("*" if w is None else f"{w}-year bands")
    zip_ = {0: "exact", ZIP_LEVELS - 1: "*"}.get(node[1], f"{4 - node[1]}-digit prefix")
    sex = "exact" if node[2] == 0 else "*"
    return f"age={age}, zip={zip_}, sex={sex}"


def plot(df: pd.DataFrame) -> None:
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5))
    ax1.plot(df["k"], df["ncp_loss"], "o-", label="NCP information loss")
    ax1.plot(df["k"], df["discernibility_norm"], "s-", label="Discernibility (normalized)")
    ax1.plot(df["k"], df["suppression_rate"], "^-", label="Suppressed records (share)")
    ax1.set_xlabel("k")
    ax1.set_ylabel("loss (0 = none, 1 = everything)")
    ax1.set_title("Utility cost of k-anonymity")
    ax2.plot(df["k"], df["linkage_rate"], "o-", color="tab:red",
             label="Linkage re-identification rate")
    ax2.plot(df["k"], df["max_prosecutor_risk"], "s--", color="tab:purple",
             label="Max prosecutor risk (1 / smallest class)")
    ax2.plot(df["k"], df["homogeneous_share"], "^:", color="tab:brown",
             label="Records in homogeneous classes (l = 1)")
    ax2.set_xlabel("k")
    ax2.set_ylabel("share / probability")
    ax2.set_title("Privacy risk after k-anonymity")
    for ax in (ax1, ax2):
        for k in K_REQUIRED:
            ax.axvline(k, color="grey", alpha=0.25)
        ax.set_xticks(df["k"])
        ax.grid(alpha=0.3)
        ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(C.FIGURES / "k_anonymity_tradeoff.png", dpi=150)
    plt.close(fig)


def main() -> pd.DataFrame:
    release = pd.read_csv(C.RELEASE_CSV, dtype={"zip": str})
    register = pd.read_csv(C.REGISTER_CSV, dtype={"zip": str})
    truth = pd.read_csv(C.GROUND_TRUTH_CSV)

    rows = []
    for k in K_VALUES:
        anon, info = anonymize(release, k)
        priv = privacy_metrics(anon, register, truth, info["node"], len(release))
        rows.append({"k": k, "generalization": describe_node(info["node"]), **info, **priv})
        if k in K_REQUIRED:
            anon.to_csv(C.RESULTS / f"anonymized_k{k}.csv", index=False)

    df = pd.DataFrame(rows)
    df["node"] = df["node"].astype(str)
    df.to_csv(C.RESULTS / "k_anonymity_results.csv", index=False)
    (C.RESULTS / "k_anonymity_results.json").write_text(
        json.dumps(df.to_dict(orient="records"), indent=2))
    plot(df)

    cols = ["k", "generalization", "suppressed", "ncp_loss", "discernibility_norm",
            "avg_class_size", "pycanon_k", "pycanon_l_occupancy", "max_prosecutor_risk",
            "homogeneous_share", "linkage_correct"]
    with pd.option_context("display.width", 200, "display.max_colwidth", 45):
        print(df[cols].round(3).to_string(index=False))
    return df


if __name__ == "__main__":
    main()
