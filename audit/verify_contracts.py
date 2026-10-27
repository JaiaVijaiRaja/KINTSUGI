import re
from pathlib import Path
import json

root = Path(__file__).resolve().parent.parent

# 1. Parse schemas from backend
schemas_dir = root / "backend" / "app" / "schemas"
types_dir = root / "frontend" / "src" / "types"

print("Comparing Backend Pydantic Schemas vs Frontend TypeScript Interfaces...")

pairs = [
    (schemas_dir / "dataset.py", types_dir / "dataset.ts"),
    (schemas_dir / "pipeline.py", types_dir / "pipeline.ts"),
    (schemas_dir / "anomaly.py", types_dir / "anomaly.ts"),
    (schemas_dir / "reconstruction.py", types_dir / "reconstruction.ts"),
    (schemas_dir / "evaluation.py", types_dir / "evaluation.ts"),
    (schemas_dir / "audit.py", types_dir / "audit.ts"),
]

for py_path, ts_path in pairs:
    if not py_path.exists() or not ts_path.exists():
        print(f"MISSING: {py_path.name} or {ts_path.name}")
        continue
    
    py_text = py_path.read_text(encoding="utf-8")
    ts_text = ts_path.read_text(encoding="utf-8")
    
    # Extract Pydantic class names
    py_classes = re.findall(r"class\s+([A-Za-z0-9_]+)\s*\((?:BaseModel|str,\s*Enum|Enum)\):", py_text)
    ts_interfaces = re.findall(r"(?:export\s+)?(?:interface|type)\s+([A-Za-z0-9_]+)", ts_text)
    
    print(f"\n--- {py_path.name} ({len(py_classes)} models) <-> {ts_path.name} ({len(ts_interfaces)} types) ---")
    print(f"Pydantic models: {', '.join(py_classes[:6])}{'...' if len(py_classes) > 6 else ''}")
    print(f"TypeScript types: {', '.join(ts_interfaces[:6])}{'...' if len(ts_interfaces) > 6 else ''}")
