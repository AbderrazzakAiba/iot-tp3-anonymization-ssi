"""End-to-end SSI scenario:  python -m part_b.demo

Municipality of El Oued (issuer) -> citizen wallet (holder) -> smart lock (verifier),
plus a second verifier (age-restricted service) to show selective disclosure, the
attacks that must fail, and revocation. JSON artifacts go to results/part_b/.
"""
from __future__ import annotations

import copy
import json
from datetime import timedelta

from part_a.config import RESULTS
from part_b.smart_lock import SmartLock
from part_b.ssi import Issuer, Verifier, Wallet, did_document
from part_b.ssi.disclosure import make_disclosure
from part_b.ssi.encoding import utcnow

OUT = RESULTS / "part_b"
CLAIMS = {"given_name": "Ahmed", "family_name": "Benali", "birth_date": "1998-04-17",
          "resident_city": "El Oued", "over_18": True}


class Clock:
    def __init__(self):
        self.now = utcnow()

    def advance(self, **kw):
        self.now += timedelta(**kw)


def save(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")


def title(text: str) -> None:
    print(f"\n{'=' * 78}\n{text}\n{'=' * 78}")


def attempt(label: str, verifier: Verifier, pres: dict, clock: Clock, lock: SmartLock | None
            ) -> bool:
    d = verifier.verify(pres, clock.now)
    print(f"  {label}\n    -> {'ACCEPT' if d.accepted else 'REJECT'}: {d.reason}")
    if d.disclosed:
        print(f"    verifier learned: {d.disclosed}")
    if lock is not None:
        lock.unlock() if d.accepted else lock.deny(d.reason)
    return d.accepted


def main() -> dict:
    clock = Clock()
    results: dict[str, bool] = {}

    title("1. Roles and decentralized identifiers (did:key, Ed25519)")
    municipality = Issuer("Municipality of El Oued")
    wallet = Wallet("Ahmed")
    trusted = {municipality.did: municipality.name}
    lock_verifier = Verifier("Building smart lock", trusted, {"resident_city": "El Oued"})
    bar_verifier = Verifier("Age-restricted service", trusted, {"over_18": True})
    lock = SmartLock()
    for who, did in [("issuer", municipality.did), ("holder", wallet.did),
                     ("smart lock", lock_verifier.did), ("service", bar_verifier.did)]:
        print(f"  {who:<11} {did}")
    save("did_document_holder.json", did_document(wallet.did))
    save("did_document_issuer.json", did_document(municipality.did))

    title("2. Issuance: holder proves control of its DID, issuer signs the credential")
    nonce = municipality.challenge(clock.now)
    issued = municipality.issue(wallet.authenticate(nonce, municipality.did, clock.now),
                                CLAIMS, "ResidentCredential", clock.now)
    cred_id = wallet.accept(issued)
    cred = issued["credential"]
    print(f"  credential id : {cred_id}")
    print(f"  signed digests: {len(cred['credentialSubject']['_sd'])} "
          f"({len(CLAIMS)} claims + 2 decoys) - no claim value appears in the credential")
    print(f"  wallet holds  : {wallet.claims(cred_id)}")
    save("credential.json", cred)
    save("wallet_disclosures.json", issued["disclosures"])

    title("3. Verifiers download the signed revocation list once (then work offline)")
    status_doc = municipality.publish_status_list(clock.now)
    for v in (lock_verifier, bar_verifier):
        v.update_status_list(status_doc, clock.now)
    save("status_list.json", status_doc)
    print(f"  status list {status_doc['id']}  ({status_doc['size']} bits, gzip)")

    title("4. Selective disclosure: each verifier learns exactly one attribute")
    clock.advance(minutes=5)
    pres = wallet.present(cred_id, ["resident_city"], lock_verifier.challenge(clock.now),
                          lock_verifier.did, clock.now)
    save("presentation_lock.json", pres)
    results["lock_resident_city"] = attempt("Smart lock asks for residency", lock_verifier,
                                            pres, clock, lock)
    pres_bar = wallet.present(cred_id, ["over_18"], bar_verifier.challenge(clock.now),
                              bar_verifier.did, clock.now)
    results["service_over_18"] = attempt("Service asks for age >= 18 (birth date hidden)",
                                         bar_verifier, pres_bar, clock, None)

    title("5. Attacks that must fail")
    results["replay"] = attempt("Replay the captured presentation", lock_verifier, pres,
                                clock, lock)

    # A dishonest holder edits his own wallet: he replaces a claim with one he made up
    # (fresh salt) and signs the presentation correctly with his real key.
    cheater = Wallet("Ahmed (tampered wallet)", keypair=wallet.keypair)
    cheater.credentials = {cred_id: {"credential": cred, "disclosures": [
        make_disclosure("resident_city", "El Oued")]}}
    results["fake_disclosure"] = attempt(
        "Holder invents a disclosure that the issuer never signed", lock_verifier,
        cheater.present(cred_id, ["resident_city"], lock_verifier.challenge(clock.now),
                        lock_verifier.did, clock.now), clock, lock)

    # Mallory copied Ahmed's credential and disclosures, but not his private key.
    mallory = Wallet("Mallory")
    mallory.credentials = copy.deepcopy(wallet.credentials)
    stolen = mallory.present(cred_id, ["resident_city"], lock_verifier.challenge(clock.now),
                             lock_verifier.did, clock.now)
    results["stolen_credential"] = attempt("Mallory presents a stolen credential", lock_verifier,
                                           stolen, clock, lock)
    stolen = mallory.present(cred_id, ["resident_city"], lock_verifier.challenge(clock.now),
                             lock_verifier.did, clock.now)
    stolen["holder"] = wallet.did      # ...and claims to be Ahmed, signing with her own key
    results["stolen_impersonation"] = attempt("Mallory also claims Ahmed's DID as holder",
                                              lock_verifier, stolen, clock, lock)
    mallory.credentials = {}

    rogue = Issuer("Rogue issuer")
    n = rogue.challenge(clock.now)
    rogue_cred = rogue.issue(mallory.authenticate(n, rogue.did, clock.now), CLAIMS,
                             "ResidentCredential", clock.now)
    rogue_id = mallory.accept(rogue_cred)
    results["untrusted_issuer"] = attempt(
        "Mallory self-issues a residency credential", lock_verifier,
        mallory.present(rogue_id, ["resident_city"], lock_verifier.challenge(clock.now),
                        lock_verifier.did, clock.now), clock, lock)

    results["policy_not_met"] = attempt(
        "Holder reveals only given_name to the lock", lock_verifier,
        wallet.present(cred_id, ["given_name"], lock_verifier.challenge(clock.now),
                       lock_verifier.did, clock.now), clock, lock)

    other = wallet.present(cred_id, ["resident_city"], bar_verifier.challenge(clock.now),
                           bar_verifier.did, clock.now)
    other["nonce"] = lock_verifier.challenge(clock.now)
    results["wrong_audience"] = attempt(
        "Presentation made for the service is forwarded to the lock", lock_verifier, other,
        clock, lock)

    title("6. Revocation")
    clock.advance(minutes=10)
    municipality.revoke(cred_id, clock.now)
    print("  municipality revokes the credential (Ahmed moved away)")
    results["revoked_but_cache_old"] = attempt(
        "Before the lock refreshes its list (staleness window)", lock_verifier,
        wallet.present(cred_id, ["resident_city"], lock_verifier.challenge(clock.now),
                       lock_verifier.did, clock.now), clock, lock)
    lock_verifier.update_status_list(municipality.publish_status_list(clock.now), clock.now)
    print("  lock downloads the new signed status list")
    results["revoked"] = attempt(
        "After refresh", lock_verifier,
        wallet.present(cred_id, ["resident_city"], lock_verifier.challenge(clock.now),
                       lock_verifier.did, clock.now), clock, lock)

    clock.advance(hours=2)
    results["stale_status_list"] = attempt(
        "Service whose status list is 2 h old (max 1 h)", bar_verifier,
        wallet.present(cred_id, ["over_18"], bar_verifier.challenge(clock.now),
                       bar_verifier.did, clock.now), clock, None)

    title("7. What each party learned")
    print("  Issuer log (only issuance / revocation events, no usage):")
    for e in municipality.log:
        print(f"    {e}")
    print("  Smart lock log:")
    for e in lock_verifier.log:
        print(f"    {e['time']} accepted={e['accepted']!s:<5} learned={e['learned_claims']}"
              f"  ({e['reason']})")
    save("issuer_log.json", municipality.log)
    save("verifier_log_lock.json", lock_verifier.log)
    save("demo_results.json", results)

    expected = {"lock_resident_city": True, "service_over_18": True, "replay": False,
                "fake_disclosure": False, "stolen_credential": False,
                "stolen_impersonation": False,
                "untrusted_issuer": False, "policy_not_met": False, "wrong_audience": False,
                "revoked_but_cache_old": True, "revoked": False, "stale_status_list": False}
    assert results == expected, f"unexpected outcome: {results}"
    print(f"\nAll {len(expected)} scenario outcomes match expectations. "
          f"Artifacts in {OUT}")
    return results


if __name__ == "__main__":
    main()
