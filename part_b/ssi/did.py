"""did:key method for Ed25519 keys (W3C CCG did:key spec), no blockchain needed.

    did:key:z<base58btc( 0xed 0x01 || 32-byte Ed25519 public key )>

The DID *is* the public key, so resolving it is a local decoding step: a verifier can
check signatures offline, without asking the issuer or any registry.
"""
from __future__ import annotations

from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (Ed25519PrivateKey,
                                                               Ed25519PublicKey)
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from part_b.ssi.encoding import b58decode, b58encode

ED25519_PUB_MULTICODEC = b"\xed\x01"
PREFIX = "did:key:z"


@dataclass
class KeyPair:
    private_key: Ed25519PrivateKey

    @classmethod
    def generate(cls) -> "KeyPair":
        return cls(Ed25519PrivateKey.generate())

    @property
    def public_bytes(self) -> bytes:
        return self.private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)

    @property
    def did(self) -> str:
        return PREFIX + b58encode(ED25519_PUB_MULTICODEC + self.public_bytes)

    @property
    def verification_method(self) -> str:
        return verification_method(self.did)

    def sign(self, data: bytes) -> bytes:
        return self.private_key.sign(data)


def verification_method(did: str) -> str:
    return f"{did}#{did.removeprefix('did:key:')}"


def resolve_public_key(did: str) -> Ed25519PublicKey:
    """Decode a did:key into its Ed25519 public key; raise ValueError if malformed."""
    if not did.startswith(PREFIX):
        raise ValueError("only did:key with base58btc multibase is supported")
    raw = b58decode(did[len(PREFIX):])
    if raw[:2] != ED25519_PUB_MULTICODEC or len(raw) != 34:
        raise ValueError("not an Ed25519 did:key")
    return Ed25519PublicKey.from_public_bytes(raw[2:])


def verify_signature(did: str, signature: bytes, data: bytes) -> bool:
    try:
        resolve_public_key(did).verify(signature, data)
        return True
    except (InvalidSignature, ValueError):
        return False


def did_document(did: str) -> dict:
    resolve_public_key(did)  # validates
    vm = verification_method(did)
    return {
        "@context": ["https://www.w3.org/ns/did/v1",
                     "https://w3id.org/security/suites/ed25519-2020/v1"],
        "id": did,
        "verificationMethod": [{
            "id": vm,
            "type": "Ed25519VerificationKey2020",
            "controller": did,
            "publicKeyMultibase": did.removeprefix("did:key:"),
        }],
        "authentication": [vm],
        "assertionMethod": [vm],
    }
