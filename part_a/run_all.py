"""Run the whole Part A pipeline:  python -m part_a.run_all"""
from part_a import config as C
from part_a import differential_privacy, k_anonymity, linkage_attack, prepare_data


def main() -> None:
    if not C.RELEASE_CSV.exists():
        prepare_data.main()
    print("\n=== 1. Linkage attack ===")
    linkage_attack.main()
    print("\n=== 2. k-anonymity ===")
    k_anonymity.main()
    print("\n=== 3. Differential privacy ===")
    differential_privacy.main()
    print(f"\nResults in {C.RESULTS}, figures in {C.FIGURES}")


if __name__ == "__main__":
    main()
