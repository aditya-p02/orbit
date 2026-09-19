import { useState, useEffect } from 'react';
import { nodes as initialNodes } from '../data/mockData';

function Sparkline({ data, color = '#6366F1', height = 48 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 200;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${w},${height}`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={`ng-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#ng-${color.replace('#','')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Last point dot */}
      {data.length > 0 && (
        <circle
          cx={(data.length - 1) / (data.length - 1) * w}
          cy={height - ((data[data.length - 1] - min) / range) * height}
          r="3"
          fill={color}
        />
      )}
    </svg>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-muted/50 rounded-xl p-3 space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function Nodes() {
  const [nodeData, setNodeData] = useState(initialNodes);

  useEffect(() => {
    const id = setInterval(() => {
      setNodeData(prev => prev.map(n => ({
        ...n,
        framesReceived: n.framesReceived + Math.floor(n.framesPerSec),
        framesPerSec: Math.max(8, Math.min(30, n.framesPerSec + (Math.random() - 0.5) * 1.5)),
        queueDepth: Math.max(0, Math.min(30, n.queueDepth + Math.floor((Math.random() - 0.5) * 3))),
        lastFrameMs: Math.floor(Math.random() * 500 + 100),
        sparkline: [...n.sparkline.slice(1), n.framesPerSec + (Math.random() - 0.5) * 2],
        queueHistory: [...n.queueHistory.slice(1), n.queueDepth],
      })));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Node Health</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Real-time telemetry from sensor nodes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {nodeData.map((node) => (
          <div key={node.id} className="bg-card rounded-3xl border border-border/60 card-shadow-md overflow-hidden">
            {/* Node header */}
            <div className="p-6 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">{node.name}</h2>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-status-live bg-status-live-bg border border-status-live/20 rounded-full px-2 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot" />
                      {node.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Last frame: {node.lastFrameMs}ms ago</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <StatBox
                  label="Frames Received"
                  value={node.framesReceived.toLocaleString()}
                  sub="Total session"
                />
                <StatBox
                  label="Frames / sec"
                  value={node.framesPerSec.toFixed(1)}
                  sub="Current rate"
                />
                <StatBox
                  label="Queue Depth"
                  value={node.queueDepth}
                  sub="Pending frames"
                />
                <StatBox
                  label="Last Frame"
                  value={`${node.lastFrameMs}ms`}
                  sub="Recency"
                />
              </div>
            </div>

            {/* Charts */}
            <div className="px-6 pb-6 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">Frames / sec</span>
                  <span className="font-mono text-muted-foreground">{node.framesPerSec.toFixed(1)} fps</span>
                </div>
                <div className="bg-muted/30 rounded-xl p-2">
                  <Sparkline data={node.sparkline} color="#6366F1" height={40} />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">Queue Depth</span>
                  <span className="font-mono text-muted-foreground">{node.queueDepth}</span>
                </div>
                <div className="bg-muted/30 rounded-xl p-2">
                  <Sparkline data={node.queueHistory} color="#06B6D4" height={32} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* System summary */}
      <div className="bg-card rounded-2xl border border-border/60 card-shadow p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-xl font-bold tabular-nums text-foreground">
            {nodeData.reduce((s, n) => s + n.framesReceived, 0).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Total Frames</div>
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums text-foreground">
            {nodeData.reduce((s, n) => s + n.framesPerSec, 0).toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Combined fps</div>
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums text-foreground">
            {nodeData.reduce((s, n) => s + n.queueDepth, 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Total Queue</div>
        </div>
        <div>
          <div className="text-xl font-bold text-status-live">Nominal</div>
          <div className="text-xs text-muted-foreground mt-1">System State</div>
        </div>
      </div>
    </div>
  );
}
