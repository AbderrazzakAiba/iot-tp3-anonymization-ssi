"""Differential privacy on an aggregate IoT query: average consumption per hour of day.

Query  q_h = (1/n) * sum_i  x_i(h),   x_i(h) = average kWh of household i at hour h (2014).

Built here:  our own Laplace mechanism  q_h + Lap(Delta / eps),  Delta = U / n.
Reused:      diffprivlib.tools.mean (IBM) for comparison with the same bounds.

Two settings are measured for eps in {0.1, 1, 10} (and a finer grid for the plot):
  * single query   - only the evening-peak hour (19:00) is released with budget eps;
  * full profile   - all 24 hours are released; by sequential composition the total
                     budget eps is split, eps / 24 per hour.
"""
from __future__ import annotations

import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from diffprivlib import tools as dp_tools

from part_a import config as C

# Public upper bound on one client's average hourly consumption (kWh). It must be
# fixed in advance (e.g. from the contracted-power tariff band), never read from the
# private data, otherwise the bound itself leaks information. Values above it are
# clipped, which biases the answer: bound_study() measures that bias-vs-noise trade-off.
BOUND_KWH = 1000.0
BOUND_CANDIDATES = [250.0, 500.0, 1000.0, 2000.0, 5000.0]
EPS_REQUIRED = [0.1, 1.0, 10.0]
EPS_GRID = np.logspace(-2, 1.3, 18)
PEAK_HOUR = 19
TRIALS = 300


def hourly_profiles() -> np.ndarray:
    """n x 24 matrix: each household's mean consumption per hour of day (kWh)."""
    hourly = pd.read_csv(C.HOURLY_CSV, index_col=0, parse_dates=True)
    return hourly.groupby(hourly.index.hour).mean().T.to_numpy()


def laplace_mean(x: np.ndarray, eps: float, upper: float, rng: np.random.Generator) -> float:
    """Our Laplace mechanism for a bounded mean with known n (add/remove-one neighbours
    are handled by treating n as public; replace-one sensitivity is U / n)."""
    x = np.clip(x, 0.0, upper)
    sensitivity = upper / len(x)
    return float(x.mean() + rng.laplace(0.0, sensitivity / eps))


def run_trials(profiles: np.ndarray, eps_values, rng) -> pd.DataFrame:
    """Errors are measured against the *clipped* true mean, the exact quantity the
    mechanism releases (the bounded-mean query). The clipping bias with respect to the
    unclipped mean does not depend on eps and is reported in its own column."""
    n = profiles.shape[0]
    target = np.clip(profiles, 0, BOUND_KWH).mean(axis=0)
    bias = np.abs(target - profiles.mean(axis=0))
    rows = []
    for eps in eps_values:
        single_own = np.array([laplace_mean(profiles[:, PEAK_HOUR], eps, BOUND_KWH, rng)
                               for _ in range(TRIALS)])
        single_lib = np.array([dp_tools.mean(profiles[:, PEAK_HOUR], epsilon=eps,
                                             bounds=(0, BOUND_KWH),
                                             random_state=int(rng.integers(1 << 31)))
                               for _ in range(TRIALS)])
        prof_err = []
        for _ in range(TRIALS):
            noisy = np.array([laplace_mean(profiles[:, h], eps / 24, BOUND_KWH, rng)
                              for h in range(24)])
            prof_err.append(np.abs(noisy - target).mean())
        mae_own = float(np.abs(single_own - target[PEAK_HOUR]).mean())
        rows.append({
            "epsilon": eps,
            "single_mae_own": mae_own,
            "single_mae_diffprivlib": float(np.abs(single_lib - target[PEAK_HOUR]).mean()),
            "single_theory_mae": BOUND_KWH / n / eps,          # E|Lap(b)| = b
            "single_rel_error": mae_own / target[PEAK_HOUR],
            "profile_mae_own": float(np.mean(prof_err)),
            "profile_theory_mae": BOUND_KWH / n / (eps / 24),
            "profile_rel_error": float(np.mean(prof_err) / target.mean()),
            "clipping_bias_peak": float(bias[PEAK_HOUR]),
        })
    return pd.DataFrame(rows)


def plot(grid: pd.DataFrame, profiles: np.ndarray, rng) -> None:
    fig, ax = plt.subplots(figsize=(7, 4.5))
    ax.loglog(grid["epsilon"], grid["single_mae_own"], "o-", label="Single hour - own Laplace")
    ax.loglog(grid["epsilon"], grid["single_mae_diffprivlib"], "x--",
              label="Single hour - diffprivlib")
    ax.loglog(grid["epsilon"], grid["single_theory_mae"], ":", color="black",
              label="Theory  U/(n eps)")
    ax.loglog(grid["epsilon"], grid["profile_mae_own"], "s-",
              label="24-hour profile (eps/24 per hour)")
    ax.axhline(grid["clipping_bias_peak"].iloc[0], color="tab:red", ls="--", alpha=0.7,
               label=f"Clipping bias at U = {BOUND_KWH:.0f} kWh (independent of eps)")
    for e in EPS_REQUIRED:
        ax.axvline(e, color="grey", alpha=0.3)
    ax.set_xlabel("privacy budget  eps  (smaller = more private)")
    ax.set_ylabel("mean absolute noise error (kWh)")
    ax.set_title(f"Utility vs privacy - Laplace mechanism (bounded mean, hour {PEAK_HOUR}:00)")
    ax.grid(alpha=0.3, which="both")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(C.FIGURES / "dp_error_vs_epsilon.png", dpi=150)
    plt.close(fig)

    truth = profiles.mean(axis=0)
    target = np.clip(profiles, 0, BOUND_KWH).mean(axis=0)
    fig, axes = plt.subplots(1, 3, figsize=(14, 4), sharey=True)
    for ax, eps in zip(axes, EPS_REQUIRED):
        noisy = [laplace_mean(profiles[:, h], eps / 24, BOUND_KWH, rng) for h in range(24)]
        ax.plot(range(24), truth, color="grey", lw=1, label="true mean (unclipped)")
        ax.plot(range(24), target, "k-", lw=2, label="true mean, clipped at U")
        ax.plot(range(24), noisy, "o--", color="tab:red", label="DP release")
        ax.set_title(f"eps = {eps}  (eps/24 per hour)")
        ax.set_xlabel("hour of day")
        ax.grid(alpha=0.3)
    axes[0].set_ylabel("average consumption (kWh)")
    axes[0].legend()
    fig.tight_layout()
    fig.savefig(C.FIGURES / "dp_hourly_profiles.png", dpi=150)
    plt.close(fig)


def bound_study(profiles: np.ndarray, eps: float = 1.0) -> pd.DataFrame:
    """Single-hour query at eps: clipping bias grows when U is small, noise when U is big."""
    n, true = profiles.shape[0], profiles[:, PEAK_HOUR].mean()
    rows = []
    for u in BOUND_CANDIDATES:
        bias = abs(np.clip(profiles[:, PEAK_HOUR], 0, u).mean() - true)
        noise = u / n / eps                          # E|Lap(b)| = b
        rows.append({"bound_kwh": u, "clients_clipped": int((profiles[:, PEAK_HOUR] > u).sum()),
                     "clipping_bias_kwh": round(float(bias), 2),
                     "expected_noise_kwh": round(noise, 2),
                     "bias_plus_noise_rel": round(float((bias + noise) / true), 4)})
    return pd.DataFrame(rows)


def main() -> pd.DataFrame:
    rng = np.random.default_rng(C.SEED)
    profiles = hourly_profiles()
    n = profiles.shape[0]
    clipped_share = float((profiles > BOUND_KWH).any(axis=1).mean())
    print(f"n = {n} clients, bound U = {BOUND_KWH} kWh, sensitivity U/n = "
          f"{BOUND_KWH / n:.3f} kWh, clients clipped at some hour = {clipped_share:.1%}")

    required = run_trials(profiles, EPS_REQUIRED, rng)
    grid = run_trials(profiles, EPS_GRID, rng)
    required.to_csv(C.RESULTS / "dp_results.csv", index=False)
    grid.to_csv(C.RESULTS / "dp_results_grid.csv", index=False)
    meta = {"n": n, "bound_kwh": BOUND_KWH, "peak_hour": PEAK_HOUR, "trials": TRIALS,
            "true_peak_mean_kwh": float(profiles[:, PEAK_HOUR].mean()),
            "true_daily_mean_kwh": float(profiles.mean()),
            "households_clipped_share": clipped_share}
    (C.RESULTS / "dp_meta.json").write_text(json.dumps(meta, indent=2))
    plot(grid, profiles, rng)
    bounds = bound_study(profiles)
    bounds.to_csv(C.RESULTS / "dp_bound_study.csv", index=False)
    print(required.round(4).to_string(index=False))
    print(f"\nChoice of the public bound U (hour {PEAK_HOUR}:00, eps = 1):")
    print(bounds.to_string(index=False))
    return required


if __name__ == "__main__":
    main()
