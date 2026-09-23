"""
ORBIT — SQLite query functions (Stage 3).

All functions take an explicit conn parameter so they can be used by
FastAPI's thread-pool executor (each call gets its own connection via
get_conn(), which is per-thread).

Import pattern:
    from orbit.storage.db import get_conn
    from orbit.storage import queries as q
    conn = get_conn()
    q.upsert_device(conn, ...)
"""

from __future__ import annotations

import json
import time
import sqlite3
from typing import Any


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

def upsert_device(
    conn: sqlite3.Connection,
    *,
    mac: str,
    ssid: str | None,
    state: str,
    score: int,
    vendor: str | None = None,
    channel: int | None = None,
    rssi: int | None = None,
    device_type: str | None = "AP",
    ts: float,
) -> None:
    conn.execute("""
        INSERT INTO devices (mac, ssid, state, score, vendor, channel, rssi, device_type, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mac) DO UPDATE SET
            ssid        = COALESCE(excluded.ssid, ssid),
            state       = excluded.state,
            score       = excluded.score,
            vendor      = COALESCE(excluded.vendor, vendor),
            channel     = CASE WHEN excluded.channel > 0 THEN excluded.channel ELSE channel END,
            rssi        = CASE WHEN excluded.rssi != -80 THEN excluded.rssi ELSE rssi END,
            device_type = COALESCE(excluded.device_type, device_type),
            last_seen   = excluded.last_seen
    """, (mac, ssid, state, score, vendor, channel or 0, rssi if rssi is not None else -80, device_type or "AP", ts, ts))
    conn.commit()


def get_all_devices(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM devices ORDER BY last_seen DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_device(conn: sqlite3.Connection, mac: str) -> dict | None:
    row = conn.execute("SELECT * FROM devices WHERE mac = ?", (mac,)).fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

def insert_alert(
    conn: sqlite3.Connection,
    *,
    device_mac: str,
    ssid: str | None,
    bssid: str,
    score: int,
    evidence: list[dict],   # [{"rule": ..., "points": ..., "detail": ...}]
    narration: str | None = None,
    ts: float | None = None,
) -> int:
    ts = ts or time.time()
    # Check if there is an existing unresolved alert for this BSSID
    existing = conn.execute(
        "SELECT id FROM alerts WHERE bssid = ? AND resolved = 0",
        (bssid,)
    ).fetchone()

    if existing:
        alert_id = existing[0]
        conn.execute("""
            UPDATE alerts
            SET score = ?, evidence_json = ?, narration = ?, timestamp = ?, ssid = COALESCE(?, ssid)
            WHERE id = ?
        """, (score, json.dumps(evidence), narration, ts, ssid, alert_id))
        conn.commit()
        return alert_id
    else:
        cur = conn.execute("""
            INSERT INTO alerts (device_mac, ssid, bssid, score, evidence_json, narration, timestamp, resolved)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        """, (device_mac, ssid, bssid, score, json.dumps(evidence), narration, ts))
        conn.commit()
        return cur.lastrowid  # type: ignore[return-value]


def get_all_alerts(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM alerts ORDER BY timestamp DESC"
    ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["evidence"] = json.loads(d.pop("evidence_json"))
        result.append(d)
    return result


def get_alert(conn: sqlite3.Connection, alert_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["evidence"] = json.loads(d.pop("evidence_json"))
    return d


def resolve_alert(conn: sqlite3.Connection, alert_id: int) -> bool:
    cur = conn.execute("UPDATE alerts SET resolved = 1 WHERE id = ?", (alert_id,))
    conn.commit()
    return cur.rowcount > 0


def unresolve_alert(conn: sqlite3.Connection, alert_id: int) -> bool:
    cur = conn.execute("UPDATE alerts SET resolved = 0 WHERE id = ?", (alert_id,))
    conn.commit()
    return cur.rowcount > 0


def update_narration(conn: sqlite3.Connection, alert_id: int, narration: str) -> None:
    conn.execute("UPDATE alerts SET narration = ? WHERE id = ?", (narration, alert_id))
    conn.commit()


# ---------------------------------------------------------------------------
# Whitelist
# ---------------------------------------------------------------------------

def get_whitelist(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM whitelist ORDER BY added_at DESC").fetchall()
    return [dict(r) for r in rows]


def add_whitelist_entry(conn: sqlite3.Connection, ssid: str, bssid: str) -> None:
    conn.execute("""
        INSERT OR IGNORE INTO whitelist (ssid, bssid, added_at) VALUES (?, ?, ?)
    """, (ssid, bssid, time.time()))
    conn.commit()


def remove_whitelist_entry(conn: sqlite3.Connection, ssid: str, bssid: str) -> bool:
    cur = conn.execute("DELETE FROM whitelist WHERE ssid = ? AND bssid = ?", (ssid, bssid))
    conn.commit()
    return cur.rowcount > 0


def load_whitelist_into_memory(conn: sqlite3.Connection, wl) -> None:
    """Load all persisted whitelist entries into a Whitelist object."""
    for row in conn.execute("SELECT ssid, bssid FROM whitelist"):
        wl.add_trusted(row["ssid"], row["bssid"])


# ---------------------------------------------------------------------------
# BLE observations (Stage 4)
# ---------------------------------------------------------------------------

def insert_ble_observation(
    conn: sqlite3.Connection,
    *,
    address: str,
    rssi: int,
    ts: float,
    correlated_wifi_bssid: str | None = None,
) -> None:
    conn.execute("""
        INSERT INTO ble_observations (address, rssi, timestamp, correlated_wifi_bssid)
        VALUES (?, ?, ?, ?)
    """, (address, rssi, ts, correlated_wifi_bssid))
    conn.commit()


# ---------------------------------------------------------------------------
# Observations / threat timeline
# ---------------------------------------------------------------------------

def insert_observation(
    conn: sqlite3.Connection,
    *,
    device_mac: str,
    event_type: str,
    detail: str | None = None,
    score: int | None = None,
    ts: float | None = None,
) -> int:
    ts = ts or time.time()
    cur = conn.execute("""
        INSERT INTO observations (device_mac, event_type, detail, score, timestamp)
        VALUES (?, ?, ?, ?, ?)
    """, (device_mac, event_type, detail, score, ts))
    conn.commit()
    return cur.lastrowid  # type: ignore[return-value]


def get_observations(conn: sqlite3.Connection, device_mac: str | None = None) -> list[dict]:
    if device_mac:
        rows = conn.execute(
            "SELECT * FROM observations WHERE device_mac = ? ORDER BY timestamp ASC",
            (device_mac,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM observations ORDER BY timestamp ASC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_health_stats(conn: sqlite3.Connection) -> dict:
    total_alerts = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    unresolved   = conn.execute("SELECT COUNT(*) FROM alerts WHERE resolved=0").fetchone()[0]
    flagged      = conn.execute("SELECT COUNT(*) FROM devices WHERE state='Flagged'").fetchone()[0]
    return {"total_alerts": total_alerts, "unresolved_alerts": unresolved, "flagged_devices": flagged}
