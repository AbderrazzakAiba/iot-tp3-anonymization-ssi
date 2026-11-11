"""Salted-hash commitments for selective disclosure (the SD-JWT mechanism).

For each claim the issuer draws a 128-bit random salt and builds
    disclosure = base64url( canonical([salt, name, value]) )
    digest     = base64url( SHA-256(disclosure) )
Only the digests go into the signed credential. The holder keeps the disclosures and
later hands over just the ones it wants to reveal. Without the salt, a verifier cannot
brute-force low-entropy values such as over_18 = true/false from the digest.
"""
from __future__ import annotations

import hashlib
import json
import os

from part_b.ssi.encoding import b64u, b64u_decode, canonical

SALT_BYTES = 16


def make_disclosure(name: str, value) -> str:
    return b64u(canonical([b64u(os.urandom(SALT_BYTES)), name, value]))


def digest(disclosure: str) -> str:
    return b64u(hashlib.sha256(disclosure.encode("ascii")).digest())


def decoy_digest() -> str:
    """Random digest with no disclosure behind it: hides how many claims exist."""
    return b64u(hashlib.sha256(os.urandom(32)).digest())


def decode(disclosure: str) -> tuple[str, str, object]:
    """Return (salt, name, value); raise ValueError on malformed input."""
    try:
        salt, name, value = json.loads(b64u_decode(disclosure))
    except (ValueError, TypeError) as exc:
        raise ValueError("malformed disclosure") from exc
    if not isinstance(salt, str) or not isinstance(name, str):
        raise ValueError("malformed disclosure")
    return salt, name, value
