import { Network, Wifi, Activity, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { classNames, formatUptime, formatDateTime } from '../utils/helpers';
import type { Health, NodeStatus } from '../types';

interface HealthTabProps {
  health: Health | null;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  color?: 'primary' | 'danger' | 'warning' | 'success' | 'info';
  loading?: boolean;
}

function MetricCard({ icon, label, value, trend, trendUp, color = 'primary', loading }: MetricCardProps) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 bg-surface-hover rounded" />
          <div className="h-8 w-16 bg-surface-hover rounded" />
        </div>
        <div className="mt-4 h-4 w-32 bg-surface-hover rounded" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-text-muted font-medium">{label}</p>
          <p className="text-3xl font-bold text-text mt-1 tabular-nums">{value}</p>
          {trend && (
            <p className={classNames('text-sm font-medium mt-2 flex items-center gap-1', trendUp ? 'text-success' : 'text-danger')}>
              {trendUp ? '↑' : '↓'} {trend}
            </p>
          )}
        </div>
        <div className={classNames('w-12 h-12 rounded-xl flex items-center justify-center', `bg-${color}-bg text-${color}`)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface NodeCardProps {
  nodeId: 'A' | 'B';
  node: NodeStatus;
}

function NodeCard({ nodeId, node }: NodeCardProps) {
  const isLive = node.status === 'LIVE';
  
  return (
    <div className="bg-card border border-border rounded-2xl p-6 hover:border-border-hover transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text">Node {nodeId}</h3>
        <span className={classNames(
          'px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5',
          isLive ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
        )}>
          <span className={classNames('w-1.5 h-1.5 rounded-full', isLive ? 'bg-success animate-pulse' : 'bg-danger')} />
          {node.status}
        </span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-bg/50 rounded-xl p-4">
            <p className="text-xs text-text-dim uppercase tracking-wider mb-1">Frames</p>
            <p className="text-2xl font-bold text-text tabular-nums">{node.frames.toLocaleString()}</p>
          </div>
          <div className="bg-bg/50 rounded-xl p-4">
            <p className="text-xs text-text-dim uppercase tracking-wider mb-1">FPS</p>
            <p className="text-2xl font-bold text-text tabular-nums">{node.fps.toFixed(1)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-bg/50 rounded-xl p-4">
            <p className="text-xs text-text-dim uppercase tracking-wider mb-1">Queue Depth</p>
            <p className="text-2xl font-bold text-text tabular-nums">{node.queue_depth}</p>
          </div>
          <div className="bg-bg/50 rounded-xl p-4">
            <p className="text-xs text-text-dim uppercase tracking-wider mb-1">Last Frame</p>
            <p className="text-sm font-mono text-text-muted">
              {node.last_frame_ts ? formatDateTime(node.last_frame_ts) : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HealthTab({ health }: HealthTabProps) {
  const loading = !health;

  const metrics = useMemo(() => [
    {
      icon: <Activity className="w-6 h-6" />,
      label: 'Uptime',
      value: health ? formatUptime(health.uptime_s) : '—',
      color: 'primary' as const,
    },
    {
      icon: <AlertTriangle className="w-6 h-6" />,
      label: 'Total Alerts',
      value: health?.total_alerts ?? 0,
      color: 'danger' as const,
    },
    {
      icon: <Wifi className="w-6 h-6" />,
      label: 'Flagged Devices',
      value: health?.flagged_devices ?? 0,
      color: 'warning' as const,
    },
    {
      icon: <CheckCircle className="w-6 h-6" />,
      label: 'Unresolved',
      value: health?.unresolved_alerts ?? 0,
      color: 'info' as const,
    },
  ], [health]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">System Health</h1>
          <p className="text-sm text-text-muted mt-1">
            Real-time monitoring status and performance metrics
          </p>
        </div>
        {loading && (
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <MetricCard key={i} {...m} loading={loading} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NodeCard nodeId="A" node={health?.nodes.A ?? { status: 'OFFLINE', frames: 0, fps: 0, queue_depth: 0, last_frame_ts: null }} />
        <NodeCard nodeId="B" node={health?.nodes.B ?? { status: 'OFFLINE', frames: 0, fps: 0, queue_depth: 0, last_frame_ts: null }} />
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-semibold text-text mb-4 flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          System Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-bg/50 rounded-xl p-4">
            <p className="text-xs text-text-dim uppercase tracking-wider mb-1">Node A Frames</p>
            <p className="text-2xl font-bold text-text tabular-nums">{health?.nodes.A.frames.toLocaleString() ?? '—'}</p>
          </div>
          <div className="bg-bg/50 rounded-xl p-4">
            <p className="text-xs text-text-dim uppercase tracking-wider mb-1">Node B Frames</p>
            <p className="text-2xl font-bold text-text tabular-nums">{health?.nodes.B.frames.toLocaleString() ?? '—'}</p>
          </div>
          <div className="bg-bg/50 rounded-xl p-4">
            <p className="text-xs text-text-dim uppercase tracking-wider mb-1">Total Frames</p>
            <p className="text-2xl font-bold text-text tabular-nums">
              {(health?.nodes.A.frames ?? 0) + (health?.nodes.B.frames ?? 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}