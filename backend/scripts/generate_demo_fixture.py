"""
Deterministic Demonstration Fixture Generator for KINTSUGI (Phase 10)

Generates a realistic, repeatable industrial gas turbine telemetry dataset
containing deterministic synthetic faults and pre-calculated ground truth.

Output:
- demo/turbine_telemetry_demo.csv (Dataset for live upload)
- demo/ground_truth_manifest.json (Reference ground truth)
"""

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from tests.fixtures.synthetic_fixture import generate_synthetic_telemetry


def main():
    demo_dir = backend_dir.parent / "demo"
    demo_dir.mkdir(parents=True, exist_ok=True)

    print("Generating deterministic industrial telemetry demonstration fixture...")
    clean_df, corrupted_df, manifest = generate_synthetic_telemetry(n_rows=60, seed=101)

    csv_path = demo_dir / "turbine_telemetry_demo.csv"
    manifest_path = demo_dir / "ground_truth_manifest.json"

    # Export CSV
    corrupted_df.to_csv(csv_path, index=False)
    print(f" Saved demonstration dataset ({len(corrupted_df)} rows): {csv_path}")

    # Export manifest
    import json
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f" Saved ground truth manifest: {manifest_path}")

    print("\nDemonstration Dataset Highlights:")
    print("  - Timestamp: 2026-03-15T00:00:00Z to 2026-03-15T00:59:00Z (1-minute intervals)")
    print("  - Sensors: temperature_bearing_c, vibration_drive_end_g, pressure_feed_bar, ambient_temp_c")
    print("  - Row 12: High-temperature spike (92.5 C vs nominal ~52.3 C)")
    print("  - Rows 24-26: Communication gap / missing telemetry on vibration channel")
    print("  - Rows 36-39: Frozen sensor telemetry on pressure feed (stuck at 4.20 bar)")
    print("\nDone. Ready for live hackathon demonstration.")


if __name__ == "__main__":
    main()
