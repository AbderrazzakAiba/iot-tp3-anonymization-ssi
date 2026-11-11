"""Centralized login (OAuth 2.0 / OpenID Connect) vs SSI: who learns what.

The same week of activity is replayed twice: Ahmed opens his building's smart lock
every day, visits an age-restricted service twice, and the pharmacy once.
  * OAuth/OIDC: every access is a redirect to the identity provider (IdP), which issues
    an ID token to the service. The IdP sees each login; services receive the profile
    claims of the requested scopes.
  * SSI: the municipality is involved once (issuance); each verifier sees only what the
    wallet discloses, and checks offline.
Run:  python -m part_b.oauth_comparison
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import timedelta

from part_a.config import RESULTS
from part_b.ssi import Issuer, Verifier, Wallet
from part_b.ssi.encoding import iso, utcnow

PROFILE = {"sub": "ahmed-4821", "given_name": "Ahmed", "family_name": "Benali",
           "birthdate": "1998-04-17", "address": "El Oued", "email": "ahmed@example.org"}
# Scopes a typical integration requests (OIDC 'profile' bundles name + birthdate).
SERVICES = {"smart-lock": ["openid", "profile", "address"],
            "age-restricted-service": ["openid", "profile"],
            "pharmacy": ["openid", "profile", "email", "address"]}
SCOPE_CLAIMS = {"openid": ["sub"], "profile": ["given_name", "family_name", "birthdate"],
                "address": ["address"], "email": ["email"]}
WEEK = [("smart-lock", d) for d in range(7)] + [("age-restricted-service", 2),
                                                 ("age-restricted-service", 5),
                                                 ("pharmacy", 3)]
SSI_REVEAL = {"smart-lock": ["resident_city"], "age-restricted-service": ["over_18"],
              "pharmacy": ["given_name", "family_name"]}


def oauth_week(start) -> dict:
    idp_log, seen_by_service = [], {}
    for service, day in WEEK:
        t = start + timedelta(days=day, hours=8)
        scopes = SERVICES[service]
        claims = {c: PROFILE[c] for s in scopes for c in SCOPE_CLAIMS[s]}
        idp_log.append({"time": iso(t), "user": PROFILE["sub"], "client": service,
                        "scopes": scopes})
        seen_by_service.setdefault(service, set()).update(claims)
    return {"idp_log": idp_log,
            "services_learned": {s: sorted(c) for s, c in seen_by_service.items()}}


def ssi_week(start) -> dict:
    muni = Issuer("Municipality of El Oued")
    wallet = Wallet("Ahmed")
    n = muni.challenge(start)
    cid = wallet.accept(muni.issue(wallet.authenticate(n, muni.did, start),
                                   {"given_name": "Ahmed", "family_name": "Benali",
                                    "birth_date": "1998-04-17", "resident_city": "El Oued",
                                    "over_18": True}, "ResidentCredential", start))
    trusted = {muni.did: muni.name}
    policies = {"smart-lock": {"resident_city": "El Oued"},
                "age-restricted-service": {"over_18": True},
                "pharmacy": {"family_name": "Benali"}}
    verifiers = {s: Verifier(s, trusted, p) for s, p in policies.items()}
    status = muni.publish_status_list(start)
    seen = {}
    for service, day in WEEK:
        t = start + timedelta(days=day, hours=8)
        v = verifiers[service]
        v.update_status_list(status, t - timedelta(minutes=1))  # periodic download, no user info
        status = muni.publish_status_list(t)
        d = v.verify(wallet.present(cid, SSI_REVEAL[service], v.challenge(t), v.did, t), t)
        assert d.accepted, d.reason
        seen.setdefault(service, set()).update(d.disclosed)
    return {"issuer_log": muni.log, "services_learned": {s: sorted(c) for s, c in seen.items()}}


def main() -> dict:
    start = utcnow()
    oauth, ssi = oauth_week(start), ssi_week(start)
    print("WHAT THE IDENTITY PROVIDER / ISSUER LEARNS DURING ONE WEEK")
    print(f"  OAuth IdP : {len(oauth['idp_log'])} login events -> "
          f"{dict(Counter(e['client'] for e in oauth['idp_log']))} (who, where, when)")
    print(f"  SSI issuer: {len(ssi['issuer_log'])} event  -> "
          f"{[e['event'] for e in ssi['issuer_log']]} (no usage at all)")
    print("\nWHAT EACH SERVICE LEARNS")
    print(f"  {'service':<24}{'OAuth/OIDC (scopes)':<60}SSI (selective disclosure)")
    for s in SERVICES:
        print(f"  {s:<24}{', '.join(oauth['services_learned'][s]):<60}"
              f"{', '.join(ssi['services_learned'][s])}")
    out = {"oauth": oauth, "ssi": ssi}
    (RESULTS / "part_b").mkdir(parents=True, exist_ok=True)
    (RESULTS / "part_b" / "oauth_vs_ssi.json").write_text(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    main()
