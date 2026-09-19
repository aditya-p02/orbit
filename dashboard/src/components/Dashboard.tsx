import { useState, useEffect, useCallback } from 'react'
import {
  type Alert,
  type Device,
  type NodeStat,
  type TimelineEvent,
} from '../data'
import TopBar from './TopBar'
import DeviceTable from './DeviceTable'
import AlertFeed from './AlertFeed'
import NodeHealth from './NodeHealth'
import Heatmap from './Heatmap'
import ThreatTimeline from './ThreatTimeline'

const API_BASE = ''

type Tab = 'devices' | 'alerts' | 'heatmap' | 'nodes' | 'timeline'

function toTimestamp(t: number | string): number {
  const n = typeof t === 'string' ? parseFloat(t) : t
  return n > 1e12 ? n : n * 1000
}

function mapBackendDevice(d: any): Device {
  const ts = toTimestamp(d.last_seen)
  const backendState = (d.state || 'Unknown').toUpperCase()
  return {
    bssid: d.mac,
    ssid: d.ssid || '—',
    vendor: d.vendor || 'unknown',
    score: d.score || 0,
    lastSeen: ts,
    channel: 0,
    security: backendState,
    isNew: false,
    x: 0.5,
    y: 0.5,
    resolved: false,
    whitelisted: false,
    state: backendState,
    rssi: d.rssi || -80,
  }
}

function mapBackendAlert(a: any): Alert {
  return {
    id: String(a.id),
    bssid: a.bssid,
    ssid: a.ssid || '—',
    vendor: a.vendor || 'unknown',
    score: a.score,
    time: toTimestamp(a.timestamp),
    evidence: (a.evidence || []).map((e: any) => ({
      rule: e.rule,
      points: e.points,
      detail: e.detail || '',
    })),
    narration: a.narration,
    resolved: !!a.resolved,
    whitelisted: false,
  }
}

function mapBackendNode(n: any): NodeStat {
  return {
    id: n.node as 'A' | 'B',
    status: n.status,
    framesTotal: n.frames,
    fps: n.fps,
    queue: n.queue_depth,
    lastFrame: toTimestamp(n.last_frame_ts),
    sparkline: [],
  }
}

function mapBackendObservation(o: any): TimelineEvent {
  const toneMap: Record<string, TimelineEvent['tone']> = {
    ssid_collision: 'flagged',
    security_downgrade: 'flagged',
    channel_mismatch: 'suspicious',
    rssi_anomaly: 'suspicious',
    karma_multi_ssid: 'flagged',
    karma_untrusted_ssid: 'suspicious',
    handshake_deauth_burst: 'flagged',
    handshake_eapol_capture: 'flagged',
    ble_wifi_correlation: 'suspicious',
  }
  return {
    id: String(o.id),
    bssid: o.device_mac,
    label: o.event_type,
    detail: o.detail || '',
    t: toTimestamp(o.timestamp),
    tone: toneMap[o.event_type] || 'info',
  }
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'devices', label: 'Devices', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg> },
  { id: 'alerts', label: 'Alerts', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg> },
  { id: 'heatmap', label: 'Heatmap', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343M11.213 11.213a4 4 0 015.656 0M12 12a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg> },
  { id: 'nodes', label: 'Node Health', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  { id: 'timeline', label: 'Timeline', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
]

export default function Dashboard({ user, onLogout }: { user: string; onLogout: () => void }) {
  const [devices, setDevices] = useState<Device[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [nodes, setNodes] = useState<NodeStat[]>([
    { id: 'A', status: 'LIVE', framesTotal: 0, fps: 0, queue: 0, lastFrame: Date.now() },
    { id: 'B', status: 'LIVE', framesTotal: 0, fps: 0, queue: 0, lastFrame: Date.now() },
  ])
  const [now, setNow] = useState(Date.now())
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('devices')
  const [timelineCollapsed, setTimelineCollapsed] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`, { credentials: 'include' })
      if (!res.ok) throw new Error('Health check failed')
      const data = await res.json()

      const devRes = await fetch(`${API_BASE}/devices`, { credentials: 'include' })
      const devData = await devRes.json()

      const alertRes = await fetch(`${API_BASE}/alerts`, { credentials: 'include' })
      const alertData = await alertRes.json()

      const obsRes = await fetch(`${API_BASE}/observations`, { credentials: 'include' })
      const obsData = await obsRes.json()

      setDevices(devData.map(mapBackendDevice))
      setAlerts(alertData.map(mapBackendAlert))
      setTimeline(obsData.map(mapBackendObservation))
      setNodes([
        mapBackendNode(data.nodes.A),
        mapBackendNode(data.nodes.B),
      ])
      setError(null)
    } catch (e) {
      setError('Failed to fetch data from API')
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const refresh = setInterval(fetchAll, 3000)
    return () => { clearInterval(tick); clearInterval(refresh) }
  }, [fetchAll])

  const resolveAlert = async (id: string) => {
    try {
      await fetch(`${API_BASE}/alerts/${id}/resolve`, { method: 'POST', credentials: 'include' })
      setAlerts(al => al.map(a => a.id === id ? { ...a, resolved: true } : a))
      fetchAll()
    } catch (e) { console.error('Resolve failed:', e) }
  }

  const whitelistAlert = async (id: string) => {
    const alert = alerts.find(a => a.id === id)
    if (!alert) return
    try {
      await fetch(`${API_BASE}/whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ssid: alert.ssid, bssid: alert.bssid }),
      })
      setAlerts(al => al.map(a => a.id === id ? { ...a, whitelisted: true } : a))
      fetchAll()
    } catch (e) { console.error('Whitelist failed:', e) }
  }

  const ssidFor = (bssid: string) => devices.find(d => d.bssid === bssid)?.ssid ?? bssid

  // Filter timeline by selected device
  const filteredTimeline = selected
    ? timeline.filter(e => e.bssid === selected).sort((a, b) => a.t - b.t)
    : [...timeline].sort((a, b) => a.t - b.t)

  if (error) {
    return (
      <div className="orbit-page flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="bg-card rounded-2xl card-shadow border border-border/60 p-8 text-center">
          <div className="text-2xl font-bold text-status-flagged mb-2">Connection Error</div>
          <div className="text-muted-foreground mb-4">{error}</div>
          <button onClick={fetchAll} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Retry</button>
        </div>
        <button onClick={onLogout} className="text-muted-foreground hover:text-foreground">Logout</button>
      </div>
    )
  }

  const renderTab = (tab: Tab) => {
    switch (tab) {
      case 'devices':
        return (
          <div className="h-full p-4 overflow-auto">
            <DeviceTable devices={devices} now={now} selected={selected} onSelect={setSelected} />
          </div>
        )
      case 'alerts':
        return (
          <div className="h-full p-4 overflow-auto">
            <AlertFeed alerts={alerts} onResolve={resolveAlert} onWhitelist={whitelistAlert} />
          </div>
        )
      case 'heatmap':
        return (
          <div className="h-full p-4">
            <Heatmap devices={devices} nodes={nodes} selected={selected} onSelect={setSelected} />
          </div>
        )
      case 'nodes':
        return (
          <div className="h-full p-4 overflow-auto">
            <NodeHealth nodes={nodes} now={now} />
          </div>
        )
      case 'timeline':
        return (
          <div className="h-full p-4 overflow-auto">
            <ThreatTimeline events={filteredTimeline} selected={selected} ssidFor={ssidFor} />
          </div>
        )
    }
  }

  return (
    <div className="orbit-page flex h-screen flex-col overflow-hidden">
      <TopBar nodes={nodes} user={user} onLogout={onLogout} reconnecting={false} />

      <nav className="shrink-0 border-b border-border bg-card/80 backdrop-blur-sm px-4" role="tablist">
        <div className="flex gap-1 max-w-7xl mx-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => { setActiveTab(t.id); setSelected(null) }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-xl transition-colors border-b-2 ${
                activeTab === t.id
                  ? 'border-primary text-primary bg-secondary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">
          {renderTab(activeTab)}
        </div>

        {/* Collapsible Timeline Panel at bottom */}
        <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-sm">
          <button
            onClick={() => setTimelineCollapsed(!timelineCollapsed)}
            className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted transition-colors"
            aria-expanded={!timelineCollapsed}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Threat Timeline</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-primary">
                {filteredTimeline.length} event{filteredTimeline.length !== 1 ? 's' : ''}
                {selected && <span className="ml-1">· {ssidFor(selected)}</span>}
              </span>
            </div>
            <span className={`text-xs text-muted-foreground transition-transform ${timelineCollapsed ? '-rotate-90' : ''}`}>
              ▾
            </span>
          </button>
          {!timelineCollapsed && (
            <div className="overflow-hidden transition-all duration-300 ease-out">
              <ThreatTimeline events={filteredTimeline} selected={selected} ssidFor={ssidFor} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}