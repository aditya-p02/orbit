const API_BASE = '';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  
  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) => 
    fetch(`${API_BASE}/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }),
    }).then(r => r.json()),
  
  logout: () => 
    fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' }).then(r => r.json()),
  
  checkAuth: () => 
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' }).then(r => r.json()),

  // Devices
  getDevices: () => fetchWithAuth('/devices'),
  getDevice: (bssid: string) => fetchWithAuth(`/devices/${bssid}`),

  // Alerts
  getAlerts: () => fetchWithAuth('/alerts'),
  resolveAlert: (id: string) => fetchWithAuth(`/alerts/${id}/resolve`, { method: 'POST' }),
  whitelistAlert: (ssid: string, bssid: string) => 
    fetchWithAuth('/whitelist', { method: 'POST', body: JSON.stringify({ ssid, bssid }) }),
  getWhitelist: () => fetchWithAuth('/whitelist'),
  removeWhitelist: (ssid: string, bssid: string) => 
    fetchWithAuth('/whitelist', { method: 'DELETE', body: JSON.stringify({ ssid, bssid }) }),

  // Nodes/Health
  getHealth: () => fetchWithAuth('/health'),
  getObservations: (mac?: string) => fetchWithAuth(`/observations${mac ? `?mac=${mac}` : ''}`),

  // Heatmap
  getHeatmap: () => fetchWithAuth('/heatmap'),
};

export interface Device {
  id: string;
  bssid: string;
  ssid: string;
  vendor: string;
  state: string;
  score: number;
  lastSeen: string;
  channel: number;
  rssi: number;
  evidence: Array<{ rule: string; points: number; detail?: string }>;
  aiNarration: string;
}

export interface Alert {
  id: string;
  bssid: string;
  ssid: string;
  vendor: string;
  severity: string;
  confidence: number;
  timestamp: string;
  evidence: Array<{ rule: string; points: number; detail?: string }>;
  narration: string;
  resolved: boolean;
  whitelisted: boolean;
}

export interface NodeStat {
  id: string;
  name: string;
  status: string;
  framesReceived: number;
  framesPerSec: number;
  queueDepth: number;
  lastFrameMs: number;
  sparkline: number[];
  queueHistory: number[];
}

export interface TimelineEvent {
  id: string;
  deviceId: string;
  ssid: string;
  bssid: string;
  timestamp: string;
  type: string;
  severity: string;
  score: number;
  description: string;
}

export interface ProximityDevice {
  id: string;
  ssid: string;
  state: 'FLAGGED' | 'SUSPICIOUS' | 'WATCHING' | 'UNKNOWN' | 'LIVE';
  x: number;
  y: number;
  rssiA: number;
  rssiB: number;
}