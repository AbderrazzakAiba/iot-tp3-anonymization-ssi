"""Tests for Part A on a small synthetic load table (no download needed)."""
import numpy as np
import pandas as pd
import pytest
from pycanon import anonymity

from part_a import differential_privacy as dp
from part_a import k_anonymity as ka
from part_a.linkage_attack import link, score
from part_a.prepare_data import build_tables


@pytest.fixture(scope="module")
def tables():
    rng = np.random.default_rng(0)
    idx = pd.date_range("2014-01-01", periods=24 * 60, freq="h")
    hourly = pd.DataFrame(rng.gamma(2.0, 2.0, size=(len(idx), 300)), index=idx,
                          columns=[f"MT_{i:03d}" for i in range(300)])
    t = build_tables(hourly, seed=1)
    return t


def test_naive_release_is_linkable(tables):
    m = link(tables["release"], tables["register"], ["age", "zip", "sex"])
    s = score(m, tables["truth"], len(tables["release"]))
    assert s["correct_reidentifications"] > 0
    assert s["correct_reidentifications"] == s["unique_matches"]   # unique match = correct


@pytest.mark.parametrize("k", [2, 5, 10])
def test_k_anonymity_holds_and_blocks_linkage(tables, k):
    anon, info = ka.anonymize(tables["release"], k)
    assert anonymity.k_anonymity(anon, ka.C.QUASI_IDENTIFIERS) >= k
    assert info["suppression_rate"] <= ka.MAX_SUPPRESSION
    m = link(anon, tables["register"], ka.C.QUASI_IDENTIFIERS,
             generalize_register=lambda r: ka.generalize(r, info["node"]))
    assert len(m) == 0


def test_information_loss_grows_with_k(tables):
    losses = [ka.anonymize(tables["release"], k)[1]["ncp_loss"] for k in (1, 2, 5, 10)]
    assert losses[0] == 0
    assert losses == sorted(losses)


def test_laplace_error_matches_theory():
    rng = np.random.default_rng(0)
    x = rng.uniform(0, 100, size=400)
    for eps in (0.1, 1.0, 10.0):
        err = [abs(dp.laplace_mean(x, eps, 100.0, rng) - x.mean()) for _ in range(4000)]
        expected = 100.0 / len(x) / eps          # E|Lap(b)| = b
        assert np.mean(err) == pytest.approx(expected, rel=0.1)
