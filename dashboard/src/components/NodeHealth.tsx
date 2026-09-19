import type { NodeStat } from '../data'
import { rel } from '../lib'
import { Panel } from './ui'

export default function NodeHealth({ nodes, now }: { nodes: NodeStat[]; now: number }) {
  return (
    <Panel title="Node Health" hint="pipeline" className="h-full space-y-4">
      <div className="space-y-3">
        {nodes.map(n => (
          <NodeCard key={n.id} node={n} now={now} />
        ))}
      </div>
    </Panel>
  )
}

function NodeCard({ node, now }: { node: NodeStat; now: number }) {
  const live = node.status === 'LIVE'
  const c = live
    ? 'var(--status-live)'
    : node.status === 'RECONNECTING'
      ? 'var(--status-suspicious)'
      : 'var(--status-flagged)'
  const label = node.status.charAt(0) + node.status.slice(1).toLowerCase()

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-5 card-shadow hover:card-shadow-lg transition-all duration-150">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[14px] font-semibold"
            style={{ backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}
          >
            {node.id}
          </span>
          <span className="text-lg font-medium text-foreground">Node {node.id}</span>
        </div>
        <span className="flex items-center gap-2 text-sm font-medium" style={{ color: c }}>
          <span
            className={`h-2 w-2 rounded-full ${live ? '' : 'animate-pulse-dot'}`}
            style={{ backgroundColor: c, color: c }}
          />
          {label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Metric label="Frames" value={node.framesTotal.toLocaleString()} />
        <Metric label="Frames / sec" value={`${node.fps.toFixed(1)}`} accent />
        <Metric label="Queue depth" value={`${node.queue}`} />
        <Metric label="Last frame" value={rel(node.lastFrame, now)} />
      </div>
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="text-lg font-semibold tabular-nums"
        style={{ color: accent ? 'var(--primary)' : 'var(--foreground)' }}
      >
        {value}
      </div>
    </div>
  )
}