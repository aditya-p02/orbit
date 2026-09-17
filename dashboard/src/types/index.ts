export interface Device {
  mac: string;
  ssid: string | null;
  state: 'Unknown' | 'Watching' | 'Suspicious' | 'Flagged';
  score: number;
  vendor: string | null;
  first_seen: number;
  last_seen: number;
}

export interface Evidence {
  rule: string;
  points: number;
  detail: string;
}

export interface Alert {
  id: number;
  device_mac: string;
  ssid: string | null;
  bssid: string;
  score: number;
  narration: string | null;
  timestamp: number;
  resolved: number;
  evidence: Evidence[];
}

export interface Health {
  uptime_s: number;
  nodes: {
    A: NodeStatus;
    B: NodeStatus;
  };
  total_alerts: number;
  unresolved_alerts: number;
  flagged_devices: number;
}

export interface NodeStatus {
  status: string;
  frames: number;
  fps: number;
  queue_depth: number;
  last_frame_ts: number | null;
}

export interface Observation {
  id: number;
  device_mac: string;
  event_type: string;
  detail: string | null;
  score: number | null;
  timestamp: number;
}

export interface WhitelistEntry {
  ssid: string;
  bssid: string;
  added_at: number;
}