"""
Deterministic Demonstration Fixture Generator for KINTSUGI

Generates realistic, repeatable industrial gas turbine telemetry datasets
for both live hackathon demonstrations:

DEMO 1: Self-Healing Industrial Sensor Data
- demo/turbine_telemetry_demo.csv (Dataset for live upload & repair)
- demo/turbine_telemetry_clean.csv (Ground truth clean baseline)
- demo/ground_truth_manifest.json (Fault locations and expected values)

DEMO 2: Trust, Abstention, Hard Cases & Evaluation
- demo/difficult_cases_demo.csv (Edge cases: boundary gaps, conflicting evidence, zero MAD)
- demo/difficult_cases_clean.csv (Ground truth clean baseline)
- demo/difficult_cases_ground_truth.json (Deterministic fault documentation)
"""

import json
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from tests.fixtures.demo_fixtures import (
    generate_demo1_turbine_telemetry,
    generate_demo2_difficult_cases_telemetry,
)


def main():
    demo_dir = backend_dir.parent / "demo"
    demo_dir.mkdir(parents=True, exist_ok=True)

    print("==================================================================")
    print(" KINTSUGI — Generating Deterministic Demo Datasets")
    print("==================================================================")

    # 1. Generate Demo 1 Fixtures
    print("\n[Demo 1] Generating Self-Healing Industrial Telemetry...")
    clean_df1, corrupted_df1, manifest1 = generate_demo1_turbine_telemetry(n_rows=60, seed=101)

    csv1_path = demo_dir / "turbine_telemetry_demo.csv"
    clean1_path = demo_dir / "turbine_telemetry_clean.csv"
    manifest1_path = demo_dir / "ground_truth_manifest.json"

    corrupted_df1.to_csv(csv1_path, index=False)
    clean_df1.to_csv(clean1_path, index=False)
    with open(manifest1_path, "w", encoding="utf-8") as f:
        json.dump(manifest1, f, indent=2)

    print(f"  [OK] Saved Demo 1 Corrupted Telemetry ({len(corrupted_df1)} rows): {csv1_path.name}")
    print(f"  [OK] Saved Demo 1 Clean Ground Truth: {clean1_path.name}")
    print(f"  [OK] Saved Demo 1 Ground Truth Manifest: {manifest1_path.name}")

    # 2. Generate Demo 2 Fixtures
    print("\n[Demo 2] Generating Difficult-Case & Abstention Telemetry...")
    clean_df2, corrupted_df2, manifest2 = generate_demo2_difficult_cases_telemetry(n_rows=60, seed=202)

    csv2_path = demo_dir / "difficult_cases_demo.csv"
    clean2_path = demo_dir / "difficult_cases_clean.csv"
    manifest2_path = demo_dir / "difficult_cases_ground_truth.json"

    corrupted_df2.to_csv(csv2_path, index=False)
    clean_df2.to_csv(clean2_path, index=False)
    with open(manifest2_path, "w", encoding="utf-8") as f:
        json.dump(manifest2, f, indent=2)

    print(f"  [OK] Saved Demo 2 Difficult Telemetry ({len(corrupted_df2)} rows): {csv2_path.name}")
    print(f"  [OK] Saved Demo 2 Clean Ground Truth: {clean2_path.name}")
    print(f"  [OK] Saved Demo 2 Ground Truth Manifest: {manifest2_path.name}")

    print("\n==================================================================")
    print(" Demo Fixtures Ready. Repeatable and Deterministic.")
    print("==================================================================")


if __name__ == "__main__":
    main()
