"""The three SSI roles: Issuer (municipality), Wallet (holder), Verifier (smart lock)."""
from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from part_b.ssi import disclosure as sd
from part_b.ssi.did import KeyPair
from part_b.ssi.encoding import b64u, iso, parse_iso
from part_b.ssi.proofs import sign_document, verify_document
from part_b.ssi.status_list import PURPOSE as STATUS_PURPOSE
from part_b.ssi.status_list import StatusList, is_revoked

CREDENTIAL_PURPOSE = "assertionMethod"
AUTH_PURPOSE = "authentication"


class _ChallengeBook:
    """Single-use random nonces with an expiry: the basis of replay protection."""

    def __init__(self, ttl: timedelta):
        self.ttl = ttl
        self._open: dict[str, datetime] = {}

    def new(self, now: datetime) -> str:
        nonce = b64u(os.urandom(16))
        self._open[nonce] = now + self.ttl
        return nonce

    def consume(self, nonce: str, now: datetime) -> bool:
        expiry = self._open.pop(nonce, None)   # popped even if expired: never reusable
        return expiry is not None and now <= expiry


def did_auth(keypair: KeyPair, nonce: str, audience: str, now: datetime) -> dict:
    """Proof that the caller controls `keypair.did` (signs a challenge for one audience)."""
    doc = {"type": "TP3DIDAuth", "holder": keypair.did, "nonce": nonce, "audience": audience}
    return sign_document(doc, keypair, AUTH_PURPOSE, now)


# =========================================================================== Issuer
class Issuer:
    def __init__(self, name: str, keypair: KeyPair | None = None):
        self.name = name
        self.keypair = keypair or KeyPair.generate()
        self.status = StatusList(self.did)
        self._challenges = _ChallengeBook(timedelta(minutes=5))
        self._index_of: dict[str, int] = {}
        self.log: list[dict] = []          # everything the issuer ever learns

    @property
    def did(self) -> str:
        return self.keypair.did

    def challenge(self, now: datetime) -> str:
        return self._challenges.new(now)

    def issue(self, auth: dict, claims: dict, cred_type: str, now: datetime,
              valid_days: int = 365, decoys: int = 2) -> dict:
        """Issue a selectively disclosable credential to the DID that signed `auth`.
        (Checking the person's real-world identity, e.g. at the town hall desk, happens
        before this call and is outside the protocol.)"""
        holder = auth.get("holder", "")
        if auth.get("audience") != self.did or not verify_document(auth, holder, AUTH_PURPOSE):
            raise PermissionError("holder did not prove control of its DID")
        if not self._challenges.consume(auth.get("nonce", ""), now):
            raise PermissionError("unknown, expired or reused issuance challenge")

        disclosures = [sd.make_disclosure(k, v) for k, v in claims.items()]
        digests = sorted([sd.digest(d) for d in disclosures] +
                         [sd.decoy_digest() for _ in range(decoys)])
        index = self.status.allocate()
        credential = {
            "@context": ["https://www.w3.org/ns/credentials/v2"],
            "id": f"urn:uuid:{uuid.uuid4()}",
            "type": ["VerifiableCredential", cred_type],
            "issuer": self.did,
            "validFrom": iso(now),
            "validUntil": iso(now + timedelta(days=valid_days)),
            "credentialSubject": {"id": holder, "_sd_alg": "sha-256", "_sd": digests},
            "credentialStatus": {"type": "TP3BitstringStatusListEntry",
                                 "statusListCredential": self.status.list_id,
                                 "statusListIndex": index},
        }
        signed = sign_document(credential, self.keypair, CREDENTIAL_PURPOSE, now)
        self._index_of[credential["id"]] = index
        self.log.append({"time": iso(now), "event": "issued", "holder": holder,
                         "credential": credential["id"], "type": cred_type})
        return {"credential": signed, "disclosures": disclosures}

    def revoke(self, credential_id: str, now: datetime) -> None:
        self.status.revoke(self._index_of[credential_id])
        self.log.append({"time": iso(now), "event": "revoked", "credential": credential_id})

    def publish_status_list(self, now: datetime) -> dict:
        return self.status.publish(self.keypair, now)


# =========================================================================== Wallet
class Wallet:
    """Holder wallet (laptop or Raspberry Pi). The private key never leaves it."""

    def __init__(self, owner: str, keypair: KeyPair | None = None):
        self.owner = owner
        self.keypair = keypair or KeyPair.generate()
        self.credentials: dict[str, dict] = {}

    @property
    def did(self) -> str:
        return self.keypair.did

    def authenticate(self, nonce: str, audience: str, now: datetime) -> dict:
        return did_auth(self.keypair, nonce, audience, now)

    def accept(self, issued: dict) -> str:
        """Check a freshly issued credential before storing it."""
        cred = issued["credential"]
        if not verify_document(cred, cred["issuer"], CREDENTIAL_PURPOSE):
            raise ValueError("issuer signature invalid")
        if cred["credentialSubject"]["id"] != self.did:
            raise ValueError("credential is bound to another DID")
        digests = set(cred["credentialSubject"]["_sd"])
        if any(sd.digest(d) not in digests for d in issued["disclosures"]):
            raise ValueError("a disclosure does not match the signed digests")
        self.credentials[cred["id"]] = issued
        return cred["id"]

    def claims(self, credential_id: str) -> dict:
        return {name: value for _, name, value in
                map(sd.decode, self.credentials[credential_id]["disclosures"])}

    def present(self, credential_id: str, reveal: list[str], nonce: str, audience: str,
                now: datetime) -> dict:
        entry = self.credentials[credential_id]
        chosen = [d for d in entry["disclosures"] if sd.decode(d)[1] in reveal]
        missing = set(reveal) - {sd.decode(d)[1] for d in chosen}
        if missing:
            raise KeyError(f"credential has no claim {sorted(missing)}")
        presentation = {"type": "TP3Presentation", "holder": self.did,
                        "verifiableCredential": entry["credential"],
                        "disclosures": chosen, "nonce": nonce, "audience": audience}
        return sign_document(presentation, self.keypair, AUTH_PURPOSE, now)


# =========================================================================== Verifier
@dataclass
class Decision:
    accepted: bool
    reason: str
    disclosed: dict = field(default_factory=dict)


class Verifier:
    """E.g. a smart lock. Works offline: it trusts a fixed list of issuer DIDs and uses a
    status list it downloaded earlier; it never calls the issuer during a check."""

    def __init__(self, name: str, trusted_issuers: dict[str, str], policy: dict,
                 status_max_age: timedelta = timedelta(hours=1),
                 nonce_ttl: timedelta = timedelta(minutes=2),
                 keypair: KeyPair | None = None):
        self.name = name
        self.keypair = keypair or KeyPair.generate()
        self.trusted_issuers = trusted_issuers
        self.policy = policy                       # claim name -> required value
        self.status_max_age = status_max_age
        self._challenges = _ChallengeBook(nonce_ttl)
        self._status: dict[str, tuple[dict, datetime]] = {}
        self.log: list[dict] = []                  # everything the verifier learns

    @property
    def did(self) -> str:
        return self.keypair.did

    def challenge(self, now: datetime) -> str:
        return self._challenges.new(now)

    def update_status_list(self, doc: dict, now: datetime) -> None:
        issuer = doc.get("issuer", "")
        if issuer not in self.trusted_issuers:
            raise PermissionError("status list from an untrusted issuer")
        if not verify_document(doc, issuer, STATUS_PURPOSE):
            raise PermissionError("status list signature invalid")
        self._status[doc["id"]] = (doc, now)

    def verify(self, pres: dict, now: datetime) -> Decision:
        decision = self._check(pres, now)
        cred = pres.get("verifiableCredential", {}) if isinstance(pres, dict) else {}
        self.log.append({"time": iso(now), "accepted": decision.accepted,
                         "reason": decision.reason, "holder_did": pres.get("holder"),
                         "credential_id": cred.get("id"), "learned_claims": decision.disclosed})
        return decision

    def _check(self, pres: dict, now: datetime) -> Decision:
        try:
            cred = pres["verifiableCredential"]
            subject = cred["credentialSubject"]
            issuer = cred["issuer"]
            status = cred["credentialStatus"]
        except (KeyError, TypeError):
            return Decision(False, "malformed presentation")

        # 1. freshness: the nonce must be one we issued, unexpired and never used before
        if not self._challenges.consume(pres.get("nonce", ""), now):
            return Decision(False, "unknown, expired or reused challenge (replay)")
        if pres.get("audience") != self.did:
            return Decision(False, "presentation was made for another verifier")
        # 2. issuer trust and credential integrity (offline: did:key gives the public key)
        if issuer not in self.trusted_issuers:
            return Decision(False, "issuer is not trusted")
        if not verify_document(cred, issuer, CREDENTIAL_PURPOSE):
            return Decision(False, "issuer signature invalid (credential modified or forged)")
        if not parse_iso(cred["validFrom"]) <= now <= parse_iso(cred["validUntil"]):
            return Decision(False, "credential expired or not yet valid")
        # 3. holder binding: the presenter must own the DID the credential was issued to
        if pres.get("holder") != subject["id"]:
            return Decision(False, "presenter is not the credential subject")
        if not verify_document(pres, subject["id"], AUTH_PURPOSE):
            return Decision(False, "holder signature invalid (stolen or altered presentation)")
        # 4. selective disclosure: every revealed claim must match a signed digest
        digests, disclosed = set(subject["_sd"]), {}
        for d in pres.get("disclosures", []):
            try:
                if sd.digest(d) not in digests:
                    return Decision(False, "disclosure does not match the signed digests")
                _, name, value = sd.decode(d)
            except (ValueError, AttributeError, UnicodeEncodeError):
                return Decision(False, "malformed disclosure")
            if name in disclosed:
                return Decision(False, "duplicate claim")
            disclosed[name] = value
        # 5. revocation: local status list, fail closed if missing or too old
        cached = self._status.get(status["statusListCredential"])
        if cached is None or now - cached[1] > self.status_max_age:
            return Decision(False, "no fresh revocation list (fail closed)", disclosed)
        if cached[0]["issuer"] != issuer:
            return Decision(False, "status list issuer mismatch", disclosed)
        if is_revoked(cached[0], status["statusListIndex"]):
            return Decision(False, "credential revoked", disclosed)
        # 6. access policy on the disclosed claims only
        for name, required in self.policy.items():
            if name not in disclosed:
                return Decision(False, f"claim '{name}' not disclosed", disclosed)
            if disclosed[name] != required:
                return Decision(False, f"claim '{name}' does not satisfy policy", disclosed)
        return Decision(True, "access granted", disclosed)
