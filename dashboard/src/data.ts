export type State = 'FLAGGED' | 'SUSPICIOUS' | 'WATCHING' | 'UNKNOWN'

export const stateForScore = (score: number): State => {
  if (score >= 70) return 'FLAGGED'
  if (score >= 40) return 'SUSPICIOUS'
  if (score >= 20) return 'WATCHING'
  return 'UNKNOWN'
}

export const stateColor: Record<State, string> = {
  FLAGGED: 'var(--status-flagged)',
  SUSPICIOUS: 'var(--status-suspicious)',
  WATCHING: 'var(--status-watching)',
  UNKNOWN: 'var(--status-unknown)',
}

export interface Device {
  bssid: string
  ssid: string
  vendor: string
  score: number
  lastSeen: number // epoch ms
  channel: number
  security: string
  isNew?: boolean
  x: number // 0..1 floor position
  y: number
  resolved?: boolean
  whitelisted?: boolean
  state: string // from backend
  rssi: number
}

export interface Evidence {
  rule: string
  points: number
  detail: string
}

export interface Alert {
  id: string
  bssid: string
  ssid: string
  vendor: string
  score: number
  time: number
  evidence: Evidence[]
  narration?: string
  resolved?: boolean
  whitelisted?: boolean
}

export interface TimelineEvent {
  id: string
  bssid: string
  label: string
  detail: string
  t: number
  tone: 'info' | 'watch' | 'suspicious' | 'flagged'
}

export interface NodeStat {
  id: 'A' | 'B'
  status: 'LIVE' | 'OFFLINE' | 'RECONNECTING'
  framesTotal: number
  fps: number
  queue: number
  lastFrame: number
  sparkline?: number[]
}

export const initialDevices: Device[] = []
export const initialNodes: NodeStat[] = [
  { id: 'A', status: 'LIVE', framesTotal: 0, fps: 0, queue: 0, lastFrame: Date.now() },
  { id: 'B', status: 'LIVE', framesTotal: 0, fps: 0, queue: 0, lastFrame: Date.now() },
]
export const initialTimeline: TimelineEvent[] = []

// Helper functions matching the new design
export const scoreDotColor = (score: number) => {
  if (score >= 60) return '#EF4444'
  if (score >= 30) return '#F59E0B'
  if (score >= 10) return '#EAB308'
  return '#9CA3AF'
}

export const stateConfig: Record<string, { label: string; color: string }> = {
  FLAGGED: { label: 'Flagged', color: 'text-status-flagged bg-status-flagged-bg border-status-flagged/20' },
  SUSPICIOUS: { label: 'Suspicious', color: 'text-status-suspicious bg-status-suspicious-bg border-status-suspicious/20' },
  WATCHING: { label: 'Watching', color: 'text-status-watching bg-status-watching-bg border-status-watching/20' },
  UNKNOWN: { label: 'Unknown', color: 'text-muted-foreground bg-muted border-border' },
  LIVE: { label: 'Live', color: 'text-status-live bg-status-live-bg border-status-live/20' },
}