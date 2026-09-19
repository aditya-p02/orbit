"""
Integration tests for the FastAPI endpoints.

Tests use TestClient (httpx under the hood) — no server needed.
The DB is created in a temp directory so tests don't pollute orbit.db.

Run with:
    cd backend
    python -m pytest tests/test_api.py -v
"""

import sys
import os
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest


# ---------------------------------------------------------------------------
# Patch DB path to a temp file before importing anything that touches storage
# ---------------------------------------------------------------------------

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db_path = _tmp_db.name
_tmp_db.close()
os.environ["ORBIT_DB_PATH"] = _tmp_db_path

from fastapi.testclient import TestClient
from orbit.api.main import app
from orbit.storage.db import init_db, _DB_PATH


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    """Initialise the temp DB once for the whole test module."""
    init_db()
    yield
    # cleanup
    try:
        os.unlink(_tmp_db_path)
    except Exception:
        pass


@pytest.fixture(scope="module")
def client():
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture(scope="module")
def auth_client(client):
    """Client with a valid session cookie."""
    resp = client.post("/login", data={"username": "admin", "password": "orbit2026"})
    assert resp.status_code == 200
    return client


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TestAuth:
    def test_login_success(self, client):
        r = client.post("/login", data={"username": "admin", "password": "orbit2026"})
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert "orbit_token" in r.cookies

    def test_login_wrong_password(self, client):
        r = client.post("/login", data={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    def test_login_wrong_username(self, client):
        r = client.post("/login", data={"username": "hacker", "password": "orbit2026"})
        assert r.status_code == 401

    def test_logout(self, client):
        client.post("/login", data={"username": "admin", "password": "orbit2026"})
        r = client.post("/logout")
        assert r.status_code == 200

    def test_unauthenticated_devices(self, client):
        """Fresh client (no cookie) must get 401."""
        fresh = TestClient(app)
        r = fresh.get("/devices")
        assert r.status_code == 401

    def test_unauthenticated_alerts(self, client):
        fresh = TestClient(app)
        r = fresh.get("/alerts")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

class TestDevices:
    def test_get_devices_returns_list(self, auth_client):
        r = auth_client.get("/devices")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

class TestAlerts:
    def test_get_alerts_returns_list(self, auth_client):
        r = auth_client.get("/alerts")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_resolve_nonexistent_alert(self, auth_client):
        r = auth_client.post("/alerts/99999/resolve")
        assert r.status_code == 404

    def test_resolve_alert_workflow(self, auth_client):
        """Insert an alert via storage layer and resolve it via API."""
        from orbit.storage.db import get_conn
        from orbit.storage import queries as q

        conn = get_conn()
        alert_id = q.insert_alert(
            conn,
            device_mac="AABBCCDDEEFF",
            ssid="TestNet",
            bssid="AABBCCDDEEFF",
            score=75,
            evidence=[{"rule": "ssid_collision", "points": 30, "detail": "test"}],
            narration="Test alert",
        )

        r = auth_client.post(f"/alerts/{alert_id}/resolve")
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # verify resolved in DB
        alerts = auth_client.get("/alerts").json()
        target = next((a for a in alerts if a["id"] == alert_id), None)
        assert target is not None
        assert target["resolved"] == 1


# ---------------------------------------------------------------------------
# Whitelist
# ---------------------------------------------------------------------------

class TestWhitelist:
    def test_get_whitelist(self, auth_client):
        r = auth_client.get("/whitelist")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_add_whitelist_entry(self, auth_client):
        r = auth_client.post("/whitelist", json={"ssid": "TestNet", "bssid": "AA:BB:CC:DD:EE:FF"})
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_added_entry_appears_in_list(self, auth_client):
        auth_client.post("/whitelist", json={"ssid": "MyNet2", "bssid": "11:22:33:44:55:66"})
        entries = auth_client.get("/whitelist").json()
        ssids = [e["ssid"] for e in entries]
        assert "MyNet2" in ssids

    def test_add_missing_fields(self, auth_client):
        r = auth_client.post("/whitelist", json={"ssid": "OnlySSID"})
        assert r.status_code == 422

    def test_delete_whitelist_entry(self, auth_client):
        auth_client.post("/whitelist", json={"ssid": "ToDelete", "bssid": "FF:EE:DD:CC:BB:AA"})
        r = auth_client.request("DELETE", "/whitelist", json={"ssid": "ToDelete", "bssid": "FF:EE:DD:CC:BB:AA"})
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_delete_nonexistent_entry(self, auth_client):
        r = auth_client.request("DELETE", "/whitelist", json={"ssid": "Ghost", "bssid": "00:00:00:00:00:00"})
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_shape(self, auth_client):
        r = auth_client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert "uptime_s" in data
        assert "nodes" in data
        assert "A" in data["nodes"]
        assert "B" in data["nodes"]
        assert "total_alerts" in data
        assert "unresolved_alerts" in data

    def test_health_node_fields(self, auth_client):
        data = auth_client.get("/health").json()
        for node in ("A", "B"):
            n = data["nodes"][node]
            assert "status" in n
            assert "frames" in n
            assert "fps" in n


# ---------------------------------------------------------------------------
# Observations
# ---------------------------------------------------------------------------

class TestObservations:
    def test_get_observations_returns_list(self, auth_client):
        r = auth_client.get("/observations")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_observations_filtered_by_mac(self, auth_client):
        r = auth_client.get("/observations?mac=AABBCCDDEEFF")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for obs in data:
            assert obs["device_mac"] == "AABBCCDDEEFF"


# ---------------------------------------------------------------------------
# Heatmap
# ---------------------------------------------------------------------------

class TestHeatmap:
    def test_heatmap_shape(self, auth_client):
        r = auth_client.get("/heatmap")
        assert r.status_code == 200
        data = r.json()
        assert "estimates" in data
        assert "calibrated" in data
        assert isinstance(data["estimates"], list)
