# ORBIT Security Dashboard

A modern React 18 + Vite + Tailwind CSS dashboard providing real-time RF intelligence, attack telemetry, and interactive controls for the ORBIT Intrusion Detection System.

---

## 💻 Views & Features

1. **Overview (`Overview.tsx`)**:
   - High-level metric summary: Active Threats, Total Devices Detected, Active Alerts, Average Node FPS, and System Health.
   - Dynamic Orbit Radar visualization showing live node signals and connected airspace entities.
   - Threat breakdown spotlight and quick alerts feed.

2. **Devices (`Devices.tsx`)**:
   - Comprehensive table of all detected RF devices across APs, Client Stations, and BLE Peripherals.
   - Multi-category filter tabs: `All`, `Flagged`, `Suspicious`, `Watching`, `AP`, `Clients`, `BLE`, `Unknown`.
   - Inspection drawer with RSSI meters, channel information, hardware OUI vendor resolution, and one-click whitelist toggling.

3. **Alerts (`Alerts.tsx`)**:
   - Live threat detection feed with severity categories (`FLAGGED`, `SUSPICIOUS`, `WATCHING`).
   - Plain-English explainable AI summaries and granular score contribution tables.
   - Alert lifecycle operations: `Mark Resolved`, `Re-open / Mark Active`, `Add to Whitelist`, and contextual device filtering.

4. **Proximity Map (`Proximity.tsx`)**:
   - 2D SVG spatial telemetry map representing a physical 12.0m x 8.0m campus monitoring zone.
   - Multi-node triangulation vectors with calibrated RSSI path-loss distance tags.
   - Non-overlapping device target pins, status indicator pills, and threat heatmap halos.

5. **Node Health (`Nodes.tsx`)**:
   - Real-time sensor metrics for Node A (Channel Hopper) and Node B (Home Guard).
   - Ingestion FPS sparklines, frame counters, queue depths, and uptime tracking.

6. **Threat Timeline (`Timeline.tsx`)**:
   - Historical chronological log of all evidence hits and RF anomalies.

---

## 🛠️ Development & Build

```bash
# Install dependencies
npm install

# Start development server with Hot Module Replacement (HMR)
npm run dev

# Typecheck and build production bundle
npm run build
```
