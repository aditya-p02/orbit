"""
ORBIT — SQLite storage layer (Stage 3).

Database lives at backend/orbit.db (created on first run).
All queries are synchronous — FastAPI runs them in a thread pool
via run_in_executor so they don't block the async event loop.

Tables:
  devices       — one row per unique BSSID seen
  alerts        — one row per alert raised (evidence stored as JSON)
  whitelist     — trusted SSID+BSSID pairs (persisted across restarts)
  ble_observations — BLE advertisement frames (Stage 4)
  observations  — raw event log for threat timeline
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

_DB_PATH = Path(__file__).resolve().parents[2] / "orbit.db"
_local = threading.local()


def get_conn() -> sqlite3.Connection:
    """Return a per-thread connection (sqlite3 is not thread-safe to share)."""
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
    return _local.conn


def init_db() -> None:
    """Create all tables if they don't exist. Safe to call on every startup."""
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS devices (
            mac         TEXT PRIMARY KEY,
            ssid        TEXT,
            state       TEXT NOT NULL DEFAULT 'Unknown',
            score       INTEGER NOT NULL DEFAULT 0,
            vendor      TEXT,
            first_seen  REAL NOT NULL,
            last_seen   REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            device_mac      TEXT NOT NULL,
            ssid            TEXT,
            bssid           TEXT NOT NULL,
            score           INTEGER NOT NULL,
            evidence_json   TEXT NOT NULL,
            narration       TEXT,
            timestamp       REAL NOT NULL,
            resolved        INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS whitelist (
            ssid        TEXT NOT NULL,
            bssid       TEXT NOT NULL,
            added_at    REAL NOT NULL,
            PRIMARY KEY (ssid, bssid)
        );

        CREATE TABLE IF NOT EXISTS ble_observations (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            address                 TEXT NOT NULL,
            rssi                    INTEGER NOT NULL,
            timestamp               REAL NOT NULL,
            correlated_wifi_bssid   TEXT
        );

        CREATE TABLE IF NOT EXISTS observations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_mac  TEXT NOT NULL,
            event_type  TEXT NOT NULL,
            detail      TEXT,
            score       INTEGER,
            timestamp   REAL NOT NULL
        );
    """)
    conn.commit()
