"""Revocation with a bitstring status list (idea of the W3C Bitstring Status List).

Each credential gets a random index in a large bitstring (131 072 bits = 16 KiB).
Bit = 1 means revoked. The issuer signs and publishes the compressed list; verifiers
download it periodically and check the bit locally, so the issuer never learns which
credential is being checked (herd privacy), unlike an online "is X valid?" call.
"""
from __future__ import annotations

import gzip
import secrets
from datetime import datetime

from part_b.ssi.did import KeyPair
from part_b.ssi.encoding import b64u, b64u_decode, iso
from part_b.ssi.proofs import sign_document

LIST_BITS = 131_072
PURPOSE = "statusList"


class StatusList:
    def __init__(self, issuer_did: str, size: int = LIST_BITS):
        self.issuer_did = issuer_did
        self.size = size
        self.bits = bytearray(size // 8)
        self.allocated: set[int] = set()

    @property
    def list_id(self) -> str:
        return f"{self.issuer_did}#status-1"

    def allocate(self) -> int:
        while True:
            idx = secrets.randbelow(self.size)
            if idx not in self.allocated:
                self.allocated.add(idx)
                return idx

    def revoke(self, index: int) -> None:
        self.bits[index // 8] |= 0x80 >> (index % 8)

    def publish(self, keypair: KeyPair, now: datetime) -> dict:
        doc = {"type": "TP3BitstringStatusList", "id": self.list_id,
               "issuer": self.issuer_did, "updated": iso(now), "size": self.size,
               "encodedList": b64u(gzip.compress(bytes(self.bits), mtime=0))}
        return sign_document(doc, keypair, PURPOSE, now)


def is_revoked(status_doc: dict, index: int) -> bool:
    bits = gzip.decompress(b64u_decode(status_doc["encodedList"]))
    if not 0 <= index < len(bits) * 8:
        raise ValueError("status index out of range")
    return bool(bits[index // 8] & (0x80 >> (index % 8)))
