"""Attach / check an Ed25519 proof on a JSON document (data-integrity style, simplified).

The signature covers canonical({"document": doc-without-proof, "proof": proof-without-value}),
so every field of the document and of the proof options (signer, purpose, time) is bound.
"""
from __future__ import annotations

from datetime import datetime

from part_b.ssi.did import KeyPair, verify_signature
from part_b.ssi.encoding import b58decode, b58encode, canonical, iso

PROOF_TYPE = "Ed25519Signature-TP3"   # not a registered suite; documented in the report


def _signing_input(doc: dict, proof_options: dict) -> bytes:
    body = {k: v for k, v in doc.items() if k != "proof"}
    return canonical({"document": body, "proof": proof_options})


def sign_document(doc: dict, keypair: KeyPair, purpose: str, now: datetime) -> dict:
    options = {"type": PROOF_TYPE, "verificationMethod": keypair.verification_method,
               "proofPurpose": purpose, "created": iso(now)}
    sig = keypair.sign(_signing_input(doc, options))
    return {**doc, "proof": {**options, "proofValue": "z" + b58encode(sig)}}


def verify_document(doc: dict, expected_signer_did: str, purpose: str) -> bool:
    proof = doc.get("proof")
    if not isinstance(proof, dict) or proof.get("type") != PROOF_TYPE:
        return False
    if proof.get("proofPurpose") != purpose:
        return False
    if not str(proof.get("verificationMethod", "")).startswith(expected_signer_did + "#"):
        return False
    value = proof.get("proofValue", "")
    if not value.startswith("z"):
        return False
    try:
        sig = b58decode(value[1:])
    except ValueError:
        return False
    options = {k: v for k, v in proof.items() if k != "proofValue"}
    return verify_signature(expected_signer_did, sig, _signing_input(doc, options))
