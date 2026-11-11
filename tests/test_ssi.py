"""Correctness and security tests for Part B (python -m pytest)."""
from datetime import timedelta

import pytest

from part_b.ssi import Issuer, KeyPair, Verifier, Wallet, did_document, resolve_public_key
from part_b.ssi import disclosure as sd
from part_b.ssi.encoding import b58decode, b58encode, utcnow
from part_b.ssi.proofs import sign_document, verify_document

CLAIMS = {"given_name": "Ahmed", "birth_date": "1998-04-17", "resident_city": "El Oued",
          "over_18": True}


@pytest.fixture
def world():
    now = utcnow()
    issuer, wallet = Issuer("Municipality"), Wallet("Ahmed")
    issued = issuer.issue(wallet.authenticate(issuer.challenge(now), issuer.did, now),
                          CLAIMS, "ResidentCredential", now)
    cid = wallet.accept(issued)
    lock = Verifier("lock", {issuer.did: "Municipality"}, {"resident_city": "El Oued"})
    lock.update_status_list(issuer.publish_status_list(now), now)
    return {"now": now, "issuer": issuer, "wallet": wallet, "cid": cid, "lock": lock}


def present(w, reveal=("resident_city",), now=None, verifier=None):
    v = verifier or w["lock"]
    now = now or w["now"]
    return w["wallet"].present(w["cid"], list(reveal), v.challenge(now), v.did, now)


# ------------------------------------------------------------------ primitives
def test_base58_roundtrip_with_leading_zeros():
    for data in (b"", b"\0\0abc", bytes(range(40))):
        assert b58decode(b58encode(data)) == data


def test_did_key_format_and_resolution():
    kp = KeyPair.generate()
    assert kp.did.startswith("did:key:z6Mk")          # Ed25519 multicodec prefix
    assert resolve_public_key(kp.did).public_bytes_raw() == kp.public_bytes
    assert did_document(kp.did)["verificationMethod"][0]["controller"] == kp.did


def test_did_key_rejects_garbage():
    with pytest.raises(ValueError):
        resolve_public_key("did:key:zNotBase58!!")
    with pytest.raises(ValueError):
        resolve_public_key("did:web:example.org")


def test_document_proof_detects_any_change():
    kp, now = KeyPair.generate(), utcnow()
    doc = sign_document({"a": 1, "b": ["x"]}, kp, "assertionMethod", now)
    assert verify_document(doc, kp.did, "assertionMethod")
    assert not verify_document({**doc, "a": 2}, kp.did, "assertionMethod")
    assert not verify_document(doc, kp.did, "authentication")           # purpose bound
    assert not verify_document(doc, KeyPair.generate().did, "assertionMethod")


def test_disclosures_are_salted():
    a, b = sd.make_disclosure("over_18", True), sd.make_disclosure("over_18", True)
    assert a != b and sd.digest(a) != sd.digest(b)
    assert sd.decode(a)[1:] == ("over_18", True)


# ------------------------------------------------------------------ issuance
def test_credential_hides_all_values(world):
    cred = world["wallet"].credentials[world["cid"]]["credential"]
    text = str(cred)
    assert "El Oued" not in text and "1998" not in text and "Ahmed" not in text
    assert len(cred["credentialSubject"]["_sd"]) == len(CLAIMS) + 2   # + decoys


def test_issuance_requires_did_control():
    now, issuer, wallet = utcnow(), Issuer("M"), Wallet("A")
    nonce = issuer.challenge(now)
    auth = wallet.authenticate(nonce, issuer.did, now)
    auth["holder"] = Wallet("B").did
    with pytest.raises(PermissionError):
        issuer.issue(auth, CLAIMS, "X", now)


def test_issuance_challenge_single_use():
    now, issuer, wallet = utcnow(), Issuer("M"), Wallet("A")
    auth = wallet.authenticate(issuer.challenge(now), issuer.did, now)
    issuer.issue(auth, CLAIMS, "X", now)
    with pytest.raises(PermissionError):
        issuer.issue(auth, CLAIMS, "X", now)


# ------------------------------------------------------------------ verification
def test_valid_presentation_reveals_only_chosen_claim(world):
    d = world["lock"].verify(present(world), world["now"])
    assert d.accepted and d.disclosed == {"resident_city": "El Oued"}


def test_replay_rejected(world):
    p = present(world)
    assert world["lock"].verify(p, world["now"]).accepted
    assert not world["lock"].verify(p, world["now"]).accepted


def test_expired_challenge_rejected(world):
    p = present(world)
    assert not world["lock"].verify(p, world["now"] + timedelta(minutes=10)).accepted


def test_tampered_credential_rejected(world):
    p = present(world)
    p["verifiableCredential"]["validUntil"] = "2099-01-01T00:00:00Z"
    assert "issuer signature" in world["lock"].verify(p, world["now"]).reason


def test_forged_disclosure_rejected(world):
    w = world
    entry = w["wallet"].credentials[w["cid"]]
    entry["disclosures"] = [sd.make_disclosure("resident_city", "El Oued")]
    assert "signed digests" in w["lock"].verify(present(w), w["now"]).reason


def test_stolen_credential_rejected(world):
    thief = Wallet("Mallory")
    thief.credentials = world["wallet"].credentials
    lock, now = world["lock"], world["now"]
    p = thief.present(world["cid"], ["resident_city"], lock.challenge(now), lock.did, now)
    assert not lock.verify(p, now).accepted
    p = thief.present(world["cid"], ["resident_city"], lock.challenge(now), lock.did, now)
    p["holder"] = world["wallet"].did
    assert "holder signature" in lock.verify(p, now).reason


def test_untrusted_issuer_rejected(world):
    now, rogue, w = world["now"], Issuer("Rogue"), Wallet("M")
    cid = w.accept(rogue.issue(w.authenticate(rogue.challenge(now), rogue.did, now),
                               CLAIMS, "X", now))
    lock = world["lock"]
    p = w.present(cid, ["resident_city"], lock.challenge(now), lock.did, now)
    assert lock.verify(p, now).reason == "issuer is not trusted"


def test_wrong_audience_rejected(world):
    other = Verifier("other", {world["issuer"].did: "M"}, {})
    p = present(world, verifier=other)
    p_nonce = world["lock"].challenge(world["now"])
    p["nonce"] = p_nonce
    assert not world["lock"].verify(p, world["now"]).accepted


def test_policy_requires_disclosure(world):
    d = world["lock"].verify(present(world, reveal=("given_name",)), world["now"])
    assert not d.accepted and "not disclosed" in d.reason


def test_revocation(world):
    w, later = world, world["now"] + timedelta(minutes=1)
    w["issuer"].revoke(w["cid"], later)
    w["lock"].update_status_list(w["issuer"].publish_status_list(later), later)
    assert w["lock"].verify(present(w, now=later), later).reason == "credential revoked"


def test_stale_status_list_fails_closed(world):
    later = world["now"] + timedelta(hours=2)
    assert "fail closed" in world["lock"].verify(present(world, now=later), later).reason


def test_forged_status_list_refused(world):
    rogue = Issuer("Rogue")
    rogue.status.revoke(5)                       # make the swapped-in list really differ
    doc = world["issuer"].publish_status_list(world["now"])
    doc["encodedList"] = rogue.publish_status_list(world["now"])["encodedList"]
    with pytest.raises(PermissionError):
        world["lock"].update_status_list(doc, world["now"])
