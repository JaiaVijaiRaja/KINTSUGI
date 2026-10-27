import sys
from pathlib import Path

# Add backend directory to path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import create_application

app = create_application()
openapi = app.openapi()

routes = []
for path, methods in openapi["paths"].items():
    for method, details in methods.items():
        routes.append({
            "path": path,
            "method": method.upper(),
            "summary": details.get("summary", ""),
            "tags": details.get("tags", []),
            "operationId": details.get("operationId", ""),
            "parameters": [p.get("name") for p in details.get("parameters", [])],
            "has_body": "requestBody" in details,
            "responses": list(details.get("responses", {}).keys())
        })

print(f"Total endpoints discovered: {len(routes)}")
for r in sorted(routes, key=lambda x: (x["path"], x["method"])):
    print(f"{r['method']:<6} {r['path']:<45} tags={r['tags']} responses={r['responses']}")
