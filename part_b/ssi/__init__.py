"""Minimal self-sovereign identity toolkit written for TP3.

Reused:  Ed25519 signatures and SHA-256 from the `cryptography` package.
Built:   did:key encoding/resolution, salted-hash selective disclosure (the SD-JWT idea
         applied to a W3C-style credential), holder binding, nonce-based replay
         protection, a bitstring revocation list, and the issuer/holder/verifier roles.
"""
from part_b.ssi.did import KeyPair, did_document, resolve_public_key
from part_b.ssi.roles import Decision, Issuer, Verifier, Wallet

__all__ = ["KeyPair", "did_document", "resolve_public_key", "Issuer", "Wallet", "Verifier",
           "Decision"]
