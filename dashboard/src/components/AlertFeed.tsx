import type { Alert } from '../data'
import { stateConfig, scoreDotColor, stateForScore } from '../data'
import { clock } from '../lib'
import { Panel } from './ui'

export default function AlertFeed({
  alerts,
  onResolve,
  onWhitelist,
}: {
  alerts: Alert[]
  onResolve: (id: string) => void
  onWhitelist: (id: string) => void
}) {
  const ordered = [...alerts].sort((a, b) => {
    if (!!a.resolved !== !!b.resolved) return a.resolved ? 1 : -1
    return b.time - a.time
  })

  return (
    <Panel
      title="Recent Alerts"
      hint={`${alerts.filter(a => !a.resolved).length} active`}
      className="h-full space-y-4"
    >
      <div className="space-y-3">
        {ordered.map(a => {
          const state = stateForScore(a.score)
          const cfg = stateConfig[state || 'UNKNOWN']
          return (
            <div
              key={a.id}
              className={`group bg-card rounded-2xl border p-4 flex items-center gap-4 transition-all duration-150 hover:-translate-y-px hover:card-shadow-md ${a.resolved ? 'border-border/60 opacity-70' : 'border-border/60 card-shadow'}`}
            >
              {/* Severity badge */}
              <div className="flex-shrink-0">
                <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-4 gap-1 sm:gap-4 items-center">
                <div className="sm:col-span-1">
                  <div className="text-sm font-semibold text-foreground truncate">{a.ssid}</div>
                  <div className="text-xs text-muted-foreground">{a.vendor}</div>
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-mono text-muted-foreground">{a.bssid}</div>
                  <div className="text-xs text-muted-foreground">{clock(a.time)}</div>
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
                      style={{ width: `${a.score}%`, background: scoreDotColor(a.score) }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: scoreDotColor(a.score) }}>
                    {a.score}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                {!a.resolved && (
                  <button
                    onClick={() => onResolve(a.id)}
                    className="flex-1 bg-primary text-primary-foreground text-sm font-medium rounded-xl py-2.5 hover:bg-primary/90 transition-colors"
                  >
                    Mark resolved
                  </button>
                )}
                <button
                  onClick={() => onWhitelist(a.id)}
                  disabled={a.whitelisted}
                  className="flex-1 border border-border text-foreground text-sm font-medium rounded-xl py-2.5 hover:bg-muted transition-colors disabled:opacity-40"
                >
                  Whitelist
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}