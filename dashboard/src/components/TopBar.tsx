import type { NodeStat } from '../data'

export default function TopBar({
  nodes,
  user,
  onLogout,
  reconnecting,
}: {
  nodes: NodeStat[]
  user: string
  onLogout: () => void
  reconnecting: boolean
}) {
  return (
    <header className="relative z-10 shrink-0 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight text-primary">
            Orbit
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Rogue AP Monitor
          </span>
        </div>

        <div className="flex items-center gap-2">
          {nodes.map((n) => (
            <NodePill key={n.id} node={n} />
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground md:inline">
            {user}
          </span>
          <button
            onClick={onLogout}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            Log out
          </button>
        </div>
      </div>

      {reconnecting && (
        <div className="flex items-center justify-center gap-2 border-t border-status-suspicious bg-status-suspicious-bg py-2 text-sm text-status-suspicious">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-suspicious" />
          Reconnecting to live feed…
        </div>
      )}
    </header>
  )
}

function NodePill({ node }: { node: NodeStat }) {
  const live = node.status === 'LIVE'
  const c = live
    ? 'var(--status-live)'
    : node.status === 'RECONNECTING'
      ? 'var(--status-suspicious)'
      : 'var(--status-flagged)'
  const label = node.status.charAt(0) + node.status.slice(1).toLowerCase()
  return (
    <div
      className="flex items-center gap-2 rounded-full border px-3 py-1.5"
      style={{
        borderColor: live ? 'var(--border)' : c,
        backgroundColor: live ? 'var(--card)' : `color-mix(in srgb, ${c} 8%, transparent)`,
      }}
    >
      <span
        className={`h-2 w-2 rounded-full ${live ? '' : 'animate-pulse-dot'}`}
        style={{ backgroundColor: c, color: c }}
      />
      <span className="text-sm font-medium text-foreground">Node {node.id}</span>
      <span className="text-sm font-medium" style={{ color: c }}>
        {label}
      </span>
    </div>
  )
}