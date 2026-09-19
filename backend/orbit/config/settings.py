"""
ORBIT — Central configuration / settings.

All tunable constants in one place. Change values here;
never scatter magic numbers across modules again.

Override at runtime via environment variables (all prefixed ORBIT_):
    export ORBIT_ALERT_THRESHOLD=70
    export ORBIT_DB_PATH=/tmp/orbit.db
    export ORBIT_USERNAME=admin
    export ORBIT_PASSWORD=changeme
    export ORBIT_SECRET=supersecret

The detection engine, API, and storage layer import from here.
"""

from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parents[2]   # …/backend/
DB_PATH     = Path(os.environ.get("ORBIT_DB_PATH", str(BACKEND_DIR / "orbit.db")))

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

AUTH_USERNAME   = os.environ.get("ORBIT_USERNAME", "admin")
AUTH_PASSWORD   = os.environ.get("ORBIT_PASSWORD", "orbit2026")
AUTH_SECRET     = os.environ.get("ORBIT_SECRET",   "orbit-dev-secret-change-before-demo")
TOKEN_TTL_S     = int(os.environ.get("ORBIT_TOKEN_TTL_S", str(8 * 3600)))   # 8 hours

# ---------------------------------------------------------------------------
# Evidence scoring weights (locked — match submitted synopsis, do not change)
# ---------------------------------------------------------------------------

SCORE_SSID_COLLISION        = int(os.environ.get("ORBIT_SCORE_SSID_COLLISION",     "30"))
SCORE_SECURITY_DOWNGRADE    = int(os.environ.get("ORBIT_SCORE_SECURITY_DOWNGRADE", "25"))
SCORE_CHANNEL_MISMATCH      = int(os.environ.get("ORBIT_SCORE_CHANNEL_MISMATCH",   "15"))
SCORE_RSSI_ANOMALY          = int(os.environ.get("ORBIT_SCORE_RSSI_ANOMALY",       "15"))
SCORE_BLE_CORRELATION       = int(os.environ.get("ORBIT_SCORE_BLE_CORRELATION",    "15"))
SCORE_AI_ANOMALY            = int(os.environ.get("ORBIT_SCORE_AI_ANOMALY",         "10"))

# Stage 2 — Karma
SCORE_KARMA_MULTI_SSID      = int(os.environ.get("ORBIT_SCORE_KARMA_MULTI_SSID",      "30"))
SCORE_KARMA_UNTRUSTED_SSID  = int(os.environ.get("ORBIT_SCORE_KARMA_UNTRUSTED_SSID",  "20"))

# Stage 2 — WPA handshake capture
SCORE_HANDSHAKE_DEAUTH      = int(os.environ.get("ORBIT_SCORE_HANDSHAKE_DEAUTH", "25"))
SCORE_HANDSHAKE_EAPOL       = int(os.environ.get("ORBIT_SCORE_HANDSHAKE_EAPOL",  "30"))

# ---------------------------------------------------------------------------
# Alert thresholds (match submitted synopsis)
# ---------------------------------------------------------------------------

THRESHOLD_WATCHING    = int(os.environ.get("ORBIT_THRESHOLD_WATCHING",   "20"))
THRESHOLD_SUSPICIOUS  = int(os.environ.get("ORBIT_THRESHOLD_SUSPICIOUS", "40"))
THRESHOLD_FLAGGED     = int(os.environ.get("ORBIT_THRESHOLD_FLAGGED",    "70"))

# Alert deduplication cooldown — suppress repeat alerts for same device
ALERT_COOLDOWN_S = float(os.environ.get("ORBIT_ALERT_COOLDOWN_S", "60"))

# ---------------------------------------------------------------------------
# Hardware / network
# ---------------------------------------------------------------------------

NODE_A_PORT         = os.environ.get("ORBIT_NODE_A_PORT", "COM5")
NODE_B_PORT         = os.environ.get("ORBIT_NODE_B_PORT", "COM6")
NODE_B_NETWORK_PORT = int(os.environ.get("ORBIT_NODE_B_NETWORK_PORT", "9001"))
SERIAL_BAUD         = int(os.environ.get("ORBIT_SERIAL_BAUD", "115200"))
API_PORT            = int(os.environ.get("ORBIT_API_PORT", "8000"))

# ---------------------------------------------------------------------------
# Detection engine
# ---------------------------------------------------------------------------

# Karma: minimum distinct SSIDs answered in window to fire
KARMA_DISTINCT_SSID_MIN  = int(os.environ.get("ORBIT_KARMA_DISTINCT_SSID_MIN", "2"))
KARMA_WINDOW_S           = float(os.environ.get("ORBIT_KARMA_WINDOW_S", "30"))

# Deauth burst: N frames within window
DEAUTH_BURST_COUNT  = int(os.environ.get("ORBIT_DEAUTH_BURST_COUNT", "3"))
DEAUTH_BURST_WINDOW = float(os.environ.get("ORBIT_DEAUTH_BURST_WINDOW", "5"))

# EAPOL must arrive within this many seconds of a deauth burst
EAPOL_WINDOW_S = float(os.environ.get("ORBIT_EAPOL_WINDOW_S", "15"))

# RSSI z-score threshold (standard deviations) and minimum samples
RSSI_Z_THRESHOLD = float(os.environ.get("ORBIT_RSSI_Z_THRESHOLD", "2.0"))
RSSI_MIN_SAMPLES = int(os.environ.get("ORBIT_RSSI_MIN_SAMPLES", "10"))
RSSI_SIMPLE_THRESHOLD_DBM = int(os.environ.get("ORBIT_RSSI_SIMPLE_THRESHOLD_DBM", "20"))

# BLE correlation
BLE_RSSI_TREND_THRESHOLD = int(os.environ.get("ORBIT_BLE_RSSI_TREND_THRESHOLD", "8"))
BLE_CORRELATION_WINDOW_S = float(os.environ.get("ORBIT_BLE_CORRELATION_WINDOW_S", "30"))
BLE_MIN_OBSERVATIONS     = int(os.environ.get("ORBIT_BLE_MIN_OBSERVATIONS", "3"))

# ---------------------------------------------------------------------------
# AI narration (Ollama)
# ---------------------------------------------------------------------------

OLLAMA_URL     = os.environ.get("ORBIT_OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL   = os.environ.get("ORBIT_OLLAMA_MODEL", "phi3:mini")
OLLAMA_TIMEOUT = int(os.environ.get("ORBIT_OLLAMA_TIMEOUT", "8"))

# ---------------------------------------------------------------------------
# Heatmap / KNN
# ---------------------------------------------------------------------------

HEATMAP_K_NEAREST = int(os.environ.get("ORBIT_HEATMAP_K_NEAREST", "3"))
HEATMAP_EMA_ALPHA = float(os.environ.get("ORBIT_HEATMAP_EMA_ALPHA", "0.3"))

# ---------------------------------------------------------------------------
# Quick-reference table (for viva / documentation)
# ---------------------------------------------------------------------------

EVIDENCE_WEIGHT_TABLE = [
    {"rule": "ssid_collision",        "points": SCORE_SSID_COLLISION,       "category": "Rule-based",  "stage": 1},
    {"rule": "security_downgrade",    "points": SCORE_SECURITY_DOWNGRADE,   "category": "Rule-based",  "stage": 1},
    {"rule": "channel_mismatch",      "points": SCORE_CHANNEL_MISMATCH,     "category": "Rule-based",  "stage": 1},
    {"rule": "rssi_anomaly",          "points": SCORE_RSSI_ANOMALY,         "category": "Rule-based",  "stage": 1},
    {"rule": "karma_multi_ssid",      "points": SCORE_KARMA_MULTI_SSID,     "category": "Rule-based",  "stage": 2},
    {"rule": "karma_untrusted_ssid",  "points": SCORE_KARMA_UNTRUSTED_SSID, "category": "Rule-based",  "stage": 2},
    {"rule": "handshake_deauth_burst","points": SCORE_HANDSHAKE_DEAUTH,     "category": "Rule-based",  "stage": 2},
    {"rule": "handshake_eapol_capture","points": SCORE_HANDSHAKE_EAPOL,     "category": "Rule-based",  "stage": 2},
    {"rule": "ble_wifi_correlation",  "points": SCORE_BLE_CORRELATION,      "category": "Contextual",  "stage": 4},
    {"rule": "rssi_anomaly_zscore",   "points": SCORE_AI_ANOMALY,           "category": "AI-assisted", "stage": 4},
]
