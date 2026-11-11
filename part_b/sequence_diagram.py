"""Draw the credential-exchange sequence diagram (PNG):  python -m part_b.sequence_diagram

Same flow as docs/sequence_diagram.md (Mermaid source) and part_b/ssi/roles.py.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from part_a.config import FIGURES

ACTORS = ["Holder wallet\n(citizen, did:key)", "Issuer\n(municipality, did:key)",
          "Verifier\n(smart lock)", "Lock actuator\n(LED / relay)"]
H, I, V, L = range(4)
# (from, to, label, style) ; from == to means an internal step; None = phase banner
STEPS = [
    (None, None, "Issuance (once)", None),
    (I, H, "nonce_i  (issuance challenge)", "->"),
    (H, I, "DIDAuth{holder DID, nonce_i, aud=issuer}  signed by holder", "->"),
    (I, I, "salt + SHA-256 per claim, 2 decoy digests, status index", "self"),
    (I, H, "VC{_sd digests, status index} signed by issuer  +  disclosures", "->"),
    (None, None, "Periodic, no user data", None),
    (V, I, "GET status list", "->"),
    (I, V, "bitstring status list  signed by issuer", "->"),
    (None, None, "Every access (issuer offline)", None),
    (V, H, "nonce_v (2 min, single use), verifier DID", "->"),
    (H, V, "VP{VC, disclosure: resident_city only, nonce_v, aud}  signed by holder", "->"),
    (V, V, "checks: nonce+aud | issuer trusted+sig | holder binding | digest | not revoked | policy", "self"),
    (V, L, "unlock  (or stay locked + reason)", "->"),
    (None, None, "Revocation", None),
    (I, I, "set bit at status index", "self"),
    (V, I, "next periodic download", "->"),
    (H, V, "same VC again", "->"),
    (V, L, "stay locked: credential revoked", "x"),
]


def main() -> None:
    xs = [1.0, 4.6, 8.2, 10.6]
    row = 0.62
    height = (len(STEPS) + 2) * row
    fig, ax = plt.subplots(figsize=(11, height * 0.62))
    ax.set_xlim(0, 11.6)
    ax.set_ylim(-height, 0.9)
    ax.axis("off")
    for x, name in zip(xs, ACTORS):
        ax.text(x, 0.35, name, ha="center", va="center", fontsize=9, weight="bold",
                bbox=dict(boxstyle="round,pad=0.35", fc="#D9E2F3", ec="#2E5496"))
        ax.plot([x, x], [-0.15, -height + 0.3], color="#8EAADB", lw=1, ls="--", zorder=0)
    y = -0.7
    n = 0
    for src, dst, label, style in STEPS:
        if src is None:
            ax.axhspan(y - 0.22, y + 0.22, color="#F2F2F2", zorder=0)
            ax.text(0.1, y, label, fontsize=8.5, style="italic", va="center", color="#404040")
        elif style == "self":
            n += 1
            ax.annotate("", xy=(xs[src] + 0.05, y - 0.18), xytext=(xs[src] + 0.05, y + 0.12),
                        arrowprops=dict(arrowstyle="->", connectionstyle="arc3,rad=-1.2",
                                        color="#C55A11"))
            ha = "right" if src >= V else "left"
            dx = -0.25 if src >= V else 0.35
            ax.text(xs[src] + dx, y, f"{n}. {label}", fontsize=7.6, va="center", ha=ha,
                    color="#843C0C", bbox=dict(fc="white", ec="none", pad=1))
        else:
            n += 1
            color = "#C00000" if style == "x" else "#1F3864"
            ax.annotate("", xy=(xs[dst], y), xytext=(xs[src], y),
                        arrowprops=dict(arrowstyle="-|>", color=color, lw=1.2))
            mid = (xs[src] + xs[dst]) / 2
            ax.text(mid, y + 0.1, f"{n}. {label}", fontsize=7.6, ha="center", va="bottom",
                    bbox=dict(fc="white", ec="none", pad=0.5),
                    color=color)
        y -= row
    fig.tight_layout()
    out = FIGURES / "sequence_diagram.png"
    fig.savefig(out, dpi=170)
    plt.close(fig)
    print("written", out)


if __name__ == "__main__":
    main()
