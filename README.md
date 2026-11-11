# TP3 — Anonymization and self-sovereign identity

IoT Security & Cybersecurity, Master IoT & Cybersecurity, University of El Oued.
Team: Abderrazzak Aiba, Abdelhakim Berrim.

* **Part A**: anonymize a real smart-meter dataset (linkage attack, k-anonymity,
  differential privacy) and measure the privacy–utility trade-off.
* **Part B**: a self-sovereign identity flow (issuer → holder wallet → smart lock) with
  `did:key`, a signed verifiable credential, selective disclosure, holder binding,
  replay protection and revocation, compared with a centralized OAuth 2.0 login.

Everything runs on a laptop (pure-software path). Part B can optionally drive an LED or relay
on a Raspberry Pi as the smart lock.

## Reproduce every result

Python 3.13 (tested on Windows 11), from the repository root:

```bash
python -m venv .venv
.venv/Scripts/activate            # Linux / Raspberry Pi: source .venv/bin/activate
pip install -r requirements.txt
pip install --no-deps pycanon==1.3.6
```

| Command | What it produces |
|---|---|
| `python -m part_a.prepare_data` | downloads the dataset (11.8 MB, once, MD5-checked) and builds `data/processed/*` |
| `python -m part_a.linkage_attack` | re-identification of the naive release → `results/linkage_attack.json`, `linkage_examples.csv` |
| `python -m part_a.k_anonymity` | k = 2, 5, 10 tables `results/anonymized_k*.csv`, metrics, `figures/k_anonymity_tradeoff.png` |
| `python -m part_a.differential_privacy` | ε = 0.1, 1, 10 → `results/dp_results.csv`, `figures/dp_error_vs_epsilon.png`, `figures/dp_hourly_profiles.png` |
| `python -m part_a.run_all` | all of Part A in order |
| `python -m part_b.demo` | full SSI scenario, attacks and revocation → `results/part_b/*.json` |
| `python -m part_b.oauth_comparison` | what an OAuth IdP learns vs an SSI issuer → `results/part_b/oauth_vs_ssi.json` |
| `python -m part_b.sequence_diagram` | `figures/sequence_diagram.png` (credential exchange) |
| `python -m pytest -q` | 26 correctness and security tests (no download needed) |
| `node docs/build_report.js . docs/TP3_report_ar.docx` | the 4-page Arabic report (needs `npm install docx@9.5.1`) |
| `node docs/build_submission.js . docs/TP3_submission_ar.docx <headings.txt>` | the full submission file (all results, figures, logs); the optional headings file (`level<TAB>page<TAB>title`, from a first Word pass) fills the static table of contents |

**Deliverables:** `docs/TP3_submission_ar.pdf` (full results, 17 pages) and `docs/TP3_report_ar.pdf`
(the 3–4 page report the TP asks for). Console outputs of every step are in `results/logs/`.

All random choices in Part A use the seed `2026` (`part_a/config.py`), so the tables and
figures come out the same on every run. Part B generates fresh keys on every run.

**Raspberry Pi smart lock (optional).** On the Pi: `pip install gpiozero`, wire an LED
(with a resistor) or a relay to BCM pin 17, then run `TP3_GPIO_PIN=17 python -m part_b.demo`.
The lock switches on for 2 s on each accepted presentation.

## Repository layout

```
part_a/   config.py · prepare_data.py · linkage_attack.py · k_anonymity.py
          differential_privacy.py · run_all.py
part_b/   ssi/encoding.py · ssi/did.py · ssi/proofs.py · ssi/disclosure.py
          ssi/status_list.py · ssi/roles.py · demo.py · oauth_comparison.py · smart_lock.py
          sequence_diagram.py
tests/    test_anonymization.py · test_ssi.py
docs/     TP3_report_ar.docx (report, Arabic) · build_report.js · sequence_diagram.md (Mermaid)
data/     raw/ (downloaded, git-ignored) · processed/ (generated)
results/  CSV / JSON outputs, figures/, part_b/
```

## Dataset

[ElectricityLoadDiagrams20112014](https://archive.ics.uci.edu/dataset/321/electricityloaddiagrams20112014)
(UCI ML Repository, CC BY 4.0) records the consumption of 370 clients of a Portuguese utility.
The original 250 MB zip could not be downloaded reliably here, so we use its hourly version from
the Monash Time Series Archive:
[Electricity Hourly Dataset](https://doi.org/10.5281/zenodo.4656140) (Zenodo, CC BY 4.0,
11.8 MB, 321 clients, 2012–2014). Each value is the sum of the four 15-minute kW readings of the
hour, so value / 4 = kWh. We keep 2014 and the 313 clients with fewer than 5 % zero hours.

Many of these clients are businesses, not homes (median 1.26 GWh/year, maximum 423 GWh). The
consumption distribution is heavy-tailed, and that matters for differential privacy (see below).

The UCI release has no demographics. To reproduce the scenario the TP asks for, where a
utility publishes a per-household table that still contains quasi-identifiers,
`prepare_data.py` adds **synthetic** owner data (name, age, sex, postal code) and a
**synthetic** public register of 2,000 residents (the 313 meter owners plus 1,687 other people)
for the attacker to join against. The sensitive attributes (`annual_kwh`, `night_share`,
`occupancy_profile`) are computed from the **real** readings.

## What we built vs what we reused

| Built in this TP | Reused from libraries / tools |
|---|---|
| Synthetic demographics, public register, ground truth | UCI dataset (real readings) |
| Linkage attack and its scoring | pandas `merge` |
| Generalization hierarchies, exhaustive lattice search with suppression, NCP and discernibility metrics | pycanon (independent check of k and l-diversity) |
| Laplace mechanism for a bounded mean, ε-splitting for the 24 h profile, error study | diffprivlib `tools.mean` (comparison) |
| did:key encoding/resolution, base58btc, DID documents | `cryptography` (Ed25519, SHA-256) |
| Signed JSON proofs, salted-hash selective disclosure with decoys, DID-auth at issuance, holder binding, nonce/audience replay protection, bitstring status list, issuer/wallet/verifier roles, OAuth comparison | — |

**Simplifications (stated honestly).** The proof suite `Ed25519Signature-TP3` signs canonical
JSON (sorted keys, RFC 8785 style). It is not a registered W3C Data Integrity suite, and
the credential is W3C-shaped but not certified as interoperable. Selective disclosure follows
the SD-JWT idea (salted digests) and is therefore **linkable**: the same issuer signature
appears in every presentation. BBS+ would remove that.

## Security notes

* Private keys live only in memory during the demo. A real wallet must keep them in secure
  storage (TPM, secure element, or an encrypted keystore on the Pi).
* The verifier **fails closed**: if its status list is missing or older than one hour, it
  refuses access. A revoked credential is still accepted until the next refresh, and
  `demo.py` shows that window on purpose.
* The DP bound `U = 1000 kWh` is a public, fixed assumption. Deriving it from the private data
  would leak information. The query is the **bounded mean**: DP error is measured against the
  clipped true mean, and the clipping bias (41 clients above U at 19:00) is reported separately
  in `results/dp_bound_study.csv`. With heavy-tailed data, choosing U is the main utility lever.

## Key results (2014, 313 clients)

| | Result |
|---|---|
| Linkage attack, naive release (age + ZIP + sex) | **150 / 313 clients re-identified (47.9 %)**, 87.9 % unique on these QIs |
| k = 2 | age in 5-year bands, ZIP to 1 digit, 10 records suppressed, NCP loss 0.25, re-identification 0 |
| k = 5 | age in 20-year bands, ZIP to 1 digit, 4 suppressed, NCP 0.30, max risk 1/6, l-diversity 2 |
| k = 10 | age removed, ZIP to 1 digit, NCP 0.54, max risk 1/29, l-diversity 3 |
| DP, single hour (19:00) | mean absolute error 30.1 / 3.07 / 0.29 kWh for ε = 0.1 / 1 / 10 (theory U/(nε) = 31.9 / 3.19 / 0.32) |
| DP, 24-hour profile (ε split over 24 h) | relative error 275 % / 28 % / 2.8 % |
| SSI demo | 12/12 scenarios as expected (2 accepted, 9 attacks or invalid states refused, 1 staleness window shown) |
