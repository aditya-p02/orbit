"""
ORBIT Stage 4 — KNN proximity heatmap (software layer).

Given RSSI readings from Node A and Node B for the same device, estimate
the device's physical location using a pre-calibrated grid of fingerprints.

How it works:
  1. Calibration: walk around the demo room, record RSSI from both nodes
     at known reference points. Store fingerprints in SQLite
     (calibration_grid table — added by this module).
  2. Live detection: for each suspicious device with dual-node RSSI readings,
     find the K nearest calibration fingerprints and return the centroid
     as the estimated location.
  3. Dashboard: renders the estimated zone as a semi-transparent circle on
     the floor plan canvas.

For midsem / before calibration: the API returns a mock location based on
RSSI magnitude so the dashboard heatmap has something to show.
"""

from __future__ import annotations

import math
import sqlite3
import time
from dataclasses import dataclass
from typing import NamedTuple

from orbit.storage.db import get_conn

K_NEAREST = 3
EMA_ALPHA = 0.3   # exponential moving average smoothing


class GridPoint(NamedTuple):
    x: float        # normalised 0.0 – 1.0 (fraction of room width)
    y: float        # normalised 0.0 – 1.0 (fraction of room height)
    rssi_a: int     # RSSI from Node A at this calibration point
    rssi_b: int     # RSSI from Node B at this calibration point


@dataclass
class LocationEstimate:
    x: float        # normalised
    y: float        # normalised
    confidence: float   # 0.0 – 1.0
    method: str     # "knn" or "mock"


def _ensure_calibration_table() -> None:
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS calibration_grid (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            x        REAL NOT NULL,
            y        REAL NOT NULL,
            rssi_a   INTEGER NOT NULL,
            rssi_b   INTEGER NOT NULL,
            label    TEXT,
            added_at REAL NOT NULL
        )
    """)
    conn.commit()


def load_grid(conn: sqlite3.Connection) -> list[GridPoint]:
    _ensure_calibration_table()
    rows = conn.execute(
        "SELECT x, y, rssi_a, rssi_b FROM calibration_grid"
    ).fetchall()
    return [GridPoint(r["x"], r["y"], r["rssi_a"], r["rssi_b"]) for r in rows]


def add_calibration_point(
    conn: sqlite3.Connection,
    x: float, y: float,
    rssi_a: int, rssi_b: int,
    label: str | None = None,
) -> None:
    _ensure_calibration_table()
    conn.execute(
        "INSERT INTO calibration_grid (x, y, rssi_a, rssi_b, label, added_at) VALUES (?, ?, ?, ?, ?, ?)",
        (x, y, rssi_a, rssi_b, label, time.time()),
    )
    conn.commit()


def knn_estimate(rssi_a: int, rssi_b: int, grid: list[GridPoint]) -> LocationEstimate:
    """
    Find K nearest calibration points to (rssi_a, rssi_b) and return centroid.
    """
    if not grid:
        return _mock_estimate(rssi_a, rssi_b)

    # Euclidean distance in RSSI space
    distances = [
        (math.sqrt((rssi_a - p.rssi_a) ** 2 + (rssi_b - p.rssi_b) ** 2), p)
        for p in grid
    ]
    distances.sort(key=lambda d: d[0])
    nearest = distances[:K_NEAREST]

    # weighted centroid (1/distance weighting)
    total_weight = 0.0
    wx = wy = 0.0
    for dist, pt in nearest:
        w = 1.0 / (dist + 1e-6)
        wx += w * pt.x
        wy += w * pt.y
        total_weight += w

    x = wx / total_weight
    y = wy / total_weight

    # confidence: inverse of mean distance, capped at 1.0
    mean_dist = sum(d for d, _ in nearest) / len(nearest)
    confidence = min(1.0, 20.0 / (mean_dist + 1.0))

    return LocationEstimate(x=x, y=y, confidence=confidence, method="knn")


def _mock_estimate(rssi_a: int, rssi_b: int) -> LocationEstimate:
    """
    Fallback when no calibration data exists. Estimates location based purely
    on which node has the stronger signal: stronger at A → near corner A (0,0),
    stronger at B → near corner B (1,1).
    """
    total_range = abs(rssi_a) + abs(rssi_b)
    if total_range == 0:
        x = y = 0.5
    else:
        # rssi_a is negative; less negative = stronger
        weight_b = (abs(rssi_a)) / total_range   # high abs(rssi_a) = weak at A = near B
        x = 0.2 + weight_b * 0.6
        y = 0.2 + weight_b * 0.6
    return LocationEstimate(x=x, y=y, confidence=0.3, method="mock")


class LocationTracker:
    """
    Maintains smoothed location estimates per device BSSID using EMA.
    """

    def __init__(self) -> None:
        self._estimates: dict[str, LocationEstimate] = {}
        self._rssi_a: dict[str, int] = {}
        self._rssi_b: dict[str, int] = {}

    def update_rssi(self, bssid: str, node_id: str, rssi: int) -> None:
        if node_id == "A":
            self._rssi_a[bssid] = rssi
        else:
            self._rssi_b[bssid] = rssi

    def estimate(self, bssid: str, grid: list[GridPoint]) -> LocationEstimate | None:
        ra = self._rssi_a.get(bssid)
        rb = self._rssi_b.get(bssid)
        if ra is None or rb is None:
            return None   # need both nodes

        new_est = knn_estimate(ra, rb, grid)
        prev = self._estimates.get(bssid)

        if prev is None:
            self._estimates[bssid] = new_est
        else:
            # EMA smoothing
            self._estimates[bssid] = LocationEstimate(
                x=EMA_ALPHA * new_est.x + (1 - EMA_ALPHA) * prev.x,
                y=EMA_ALPHA * new_est.y + (1 - EMA_ALPHA) * prev.y,
                confidence=new_est.confidence,
                method=new_est.method,
            )
        return self._estimates[bssid]

    def all_estimates(self) -> dict[str, LocationEstimate]:
        return dict(self._estimates)
