import type { Device, Alert, Health, Observation, WhitelistEntry } from '../types';

const API_BASE = 'http://localhost:8000';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    const error = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ ok: boolean; username: string }>('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }),
    }),

  logout: () => request<void>('/logout', { method: 'POST' }),

  // Devices
  getDevices: () => request<Device[]>('/devices'),

  // Alerts
  getAlerts: () => request<Alert[]>('/alerts'),
  resolveAlert: (id: number) => request<void>(`/alerts/${id}/resolve`, { method: 'POST' }),

  // Whitelist
  getWhitelist: () => request<WhitelistEntry[]>('/whitelist'),
  addWhitelist: (ssid: string, bssid: string) =>
    request<{ ok: boolean; ssid: string; bssid: string }>('/whitelist', {
      method: 'POST',
      body: JSON.stringify({ ssid, bssid }),
    }),
  removeWhitelist: (ssid: string, bssid: string) =>
    request<void>('/whitelist', {
      method: 'DELETE',
      body: JSON.stringify({ ssid, bssid }),
    }),

  // Health
  getHealth: () => request<Health>('/health'),

  // Observations
  getObservations: (mac?: string) =>
    request<Observation[]>(`/observations${mac ? `?mac=${mac}` : ''}`),

  // Heatmap
  getHeatmap: () => request<any>('/heatmap'),
};