from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check_returns_healthy():
    """Verify that GET /api/health returns 200 and expected health metadata."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "kintsugi-api"
    assert "version" in data
    assert "environment" in data
    assert "timestamp" in data


def test_custom_404_error_handling():
    """Verify that non-existent routes return structured 404 JSON error."""
    response = client.get("/api/nonexistent-route")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == 404
    assert data["error"]["path"] == "/api/nonexistent-route"


def test_cors_headers_for_allowed_origin():
    """Verify that allowed frontend origin receives CORS headers."""
    allowed_origin = "http://localhost:5173"
    response = client.get(
        "/api/health",
        headers={"Origin": allowed_origin},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == allowed_origin
