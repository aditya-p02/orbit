import { useState } from 'react'
import type { Device } from '../data'
import { stateConfig, scoreDotColor } from '../data'
import { rel } from '../lib'
import { Panel } from './ui'

export default function DeviceTable({
  devices,
  now,
  selected,
  onSelect,
}: {
  devices: Device[]
  now: number
  selected: string | null
  onSelect: (bssid: string | null) => void
}) {
  const [filter, setFilter] = useState<string>('All')
  const filters = ['All', 'Flagged', 'Suspicious', 'Watching', 'Unknown']

  const filtered = devices.filter(d => {
    if (filter === 'All') return true
    const deviceState = (d.state || 'UNKNOWN').toUpperCase()
    const filterState = filter.toUpperCase()
    return deviceState === filterState
  })

  return (
    <Panel
      title="Detected Devices"
      hint={`${devices.length} devices in wireless environment`}
      className="h-full space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Detected Devices</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{devices.length} devices in wireless environment</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot" />
          Live monitoring
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-150 ${
              filter === f
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {f}
            {f !== 'All' && (
              <span className="ml-1.5 opacity-70">
                {devices.filter(d => d.state === f.toUpperCase()).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Device list */}
      <div className="space-y-2">
        {filtered.map(device => {
          const stateKey = (device.state || 'UNKNOWN').toUpperCase()
          const cfg = stateConfig[stateKey] || stateConfig.UNKNOWN
          const isSelected = selected === device.bssid
          return (
            <div
              key={device.bssid}
              onClick={() => {
                onSelect(isSelected ? null : device.bssid)
              }}
              className={`group bg-card rounded-2xl border p-4 flex items-center gap-4 cursor-pointer transition-all duration-150 hover:-translate-y-px hover:card-shadow-md ${
                isSelected ? 'border-primary/40 bg-secondary/30' : 'border-border/60 card-shadow'
              }`}
            >
              {/* State indicator */}
              <div className="flex-shrink-0">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: scoreDotColor(device.score) }}
                />
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-4 gap-1 sm:gap-4 items-center">
                <div className="sm:col-span-1">
                  <div className="text-sm font-semibold text-foreground truncate">{device.ssid}</div>
                  <div className="text-xs text-muted-foreground">{device.vendor}</div>
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-mono text-muted-foreground">{device.bssid}</div>
                  <div className="text-xs text-muted-foreground">CH {device.channel} · {device.rssi} dBm</div>
                </div>
                <div className="hidden sm:block">
                  <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${device.score}%`, background: scoreDotColor(device.score) }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: scoreDotColor(device.score) }}>
                    {device.score}
                  </span>
                </div>
              </div>

              {/* Last seen */}
              <div className="text-xs text-muted-foreground flex-shrink-0">{rel(device.lastSeen, now)}</div>

              {/* Hover actions */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="View details"
                  onClick={e => { e.stopPropagation(); onSelect(device.bssid) }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {selected ? 'Timeline filtered to this device' : 'Select a device to filter the timeline'}
    </Panel>
  )
}