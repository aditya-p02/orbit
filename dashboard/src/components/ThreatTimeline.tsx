import { useState } from 'react'
import type { TimelineEvent } from '../data'
import { clock } from '../lib'
import { Panel } from './ui'

const toneColor: Record<TimelineEvent['tone'], string> = {
  info: 'var(--status-unknown)',
  watch: 'var(--status-watching)',
  suspicious: 'var(--status-suspicious)',
  flagged: 'var(--status-flagged)',
}

export default function ThreatTimeline({
  events,
  selected,
  ssidFor,
}: {
  events: TimelineEvent[]
  selected: string | null
  ssidFor: (bssid: string) => string
}) {
  const [active, setActive] = useState<string | null>(null)

  const shown = selected ? events.filter((e) => e.bssid === selected) : events
  const ordered = [...shown].sort((a, b) => a.t - b.t)

  if (ordered.length === 0) {
    return (
      <Panel
        title="Threat Timeline"
        hint={selected ? `filtered · ${ssidFor(selected)}` : 'all devices'}
        className="h-full"
      >
        <div className="flex h-full items-center justify-center py-16 text-center text-[13px] text-muted-foreground">
          No events for this device yet.
        </div>
      </Panel>
    )
  }

  // Calculate relative positions for timeline layout
  const minTime = ordered.length > 0 ? ordered[0].t : Date.now()
  const maxTime = ordered.length > 0 ? ordered[ordered.length - 1].t : Date.now()
  const timeRange = maxTime - minTime || 1

  return (
    <Panel
      title="Threat Timeline"
      hint={selected ? `filtered · ${ssidFor(selected)}` : 'all devices'}
      className="h-full"
    >
      <div className="relative min-w-max px-8 py-8" style={{ minHeight: 200 }}>
        {/* Baseline */}
        <div className="absolute left-8 right-8 top-1/2 h-px rounded-full bg-border" />

        <div className="relative flex items-center gap-16">
          {ordered.map((e, i) => {
            const c = toneColor[e.tone]
            const up = i % 2 === 0
            const isActive = active === e.id
            // Position based on time
            const position = ((e.t - minTime) / timeRange) * 100
            const clampedPosition = Math.max(0, Math.min(100, position))

            return (
              <div key={e.id} className="relative flex flex-col items-center" style={{ left: `${clampedPosition}%` }}>
                <button
                  onClick={() => setActive(isActive ? null : e.id)}
                  className="relative z-10 h-4 w-4 rounded-full border-2 bg-card transition-transform hover:scale-125"
                  style={{ backgroundColor: isActive ? c : 'var(--card)', borderColor: c }}
                  aria-label={e.label}
                />
                <div className={`absolute w-48 text-center ${up ? 'bottom-7' : 'top-7'}`}>
                  <div className="text-sm font-medium" style={{ color: c }}>
                    {e.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {clock(e.t)} · {ssidFor(e.bssid)}
                  </div>
                  {isActive && (
                    <div className="mt-2 rounded-lg border border-border bg-card px-3 py-2 text-xs leading-snug text-foreground shadow-sm">
                      {e.detail}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}