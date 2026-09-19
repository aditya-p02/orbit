import { useState, useEffect, useRef } from 'react';
import { devices, alerts, nodes } from '../data/mockData';

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon: React.ReactNode;
  delay?: number;
}

function MetricCard({ label, value, sub, color = 'text-foreground', icon, delay = 0 }: MetricCardProps) {
  const [displayed, setDisplayed] = useState(0);
  const numVal = typeof value === 'number' ? value : NaN;

  useEffect(() => {
    if (isNaN(numVal)) return;
    const timer = setTimeout(() => {
      let start = 0;
      const end = numVal;
      const duration = 800;
      const startTime = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayed(Math.round(start + (end - start) * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timer);
  }, [numVal, delay]);

  return (
    <div
      className="bg-card rounded-2xl p-5 card-shadow-md border border-border/60 flex flex-col gap-3 hover:card-shadow-lg transition-all duration-200 hover:-translate-y-0.5 animate-slide-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{label}</span>
        <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
      <div className={`text-3xl font-bold tabular-nums tracking-tight ${color}`}>
        {isNaN(numVal) ? value : displayed.toLocaleString()}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function OrbitVisualization() {
  const canvasRef = useRef<SVGSVGElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 50);
    return () => clearInterval(id);
  }, []);

  const centerX = 200;
  const centerY = 180;

  const nodeA = { x: centerX - 110, y: centerY - 50 };
  const nodeB = { x: centerX + 115, y: centerY - 40 };

  const devicePositions = [
    { x: centerX - 60, y: centerY + 80, state: 'FLAGGED', label: 'HomeNet-5G' },
    { x: centerX + 80, y: centerY + 70, state: 'SUSPICIOUS', label: 'CoffeeShop' },
    { x: centerX + 130, y: centerY + 20, state: 'WATCHING', label: 'NETGEAR' },
    { x: centerX - 130, y: centerY + 30, state: 'UNKNOWN', label: 'TP-Link' },
  ];

  const stateColors: Record<string, string> = {
    FLAGGED: '#EF4444',
    SUSPICIOUS: '#F59E0B',
    WATCHING: '#EAB308',
    UNKNOWN: '#9CA3AF',
  };

  const particles = [
    { path: `M${nodeA.x},${nodeA.y} Q${centerX - 55},${centerY - 20} ${centerX},${centerY}`, speed: 0.8 },
    { path: `M${nodeB.x},${nodeB.y} Q${centerX + 55},${centerY - 20} ${centerX},${centerY}`, speed: 1.1 },
    { path: `M${centerX},${centerY} Q${centerX - 30},${centerY + 40} ${devicePositions[0].x},${devicePositions[0].y}`, speed: 0.6 },
    { path: `M${centerX},${centerY} Q${centerX + 40},${centerY + 35} ${devicePositions[1].x},${devicePositions[1].y}`, speed: 0.9 },
  ];

  const t = (tick * 50) / 1000;

  return (
    <svg ref={canvasRef} viewBox="0 0 400 360" className="w-full h-full" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
        </radialGradient>
        <filter id="blur2">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* Subtle orbit rings */}
      <circle cx={centerX} cy={centerY} r="130" fill="none" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4 8" opacity="0.6" />
      <circle cx={centerX} cy={centerY} r="85" fill="none" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="2 6" opacity="0.4" />

      {/* Center glow */}
      <circle cx={centerX} cy={centerY} r="60" fill="url(#centerGlow)" />

      {/* Connection lines */}
      {devicePositions.map((d, i) => (
        <line
          key={i}
          x1={centerX} y1={centerY}
          x2={d.x} y2={d.y}
          stroke={stateColors[d.state]}
          strokeWidth="1"
          strokeDasharray="3 5"
          opacity="0.3"
        />
      ))}
      <line x1={centerX} y1={centerY} x2={nodeA.x} y2={nodeA.y} stroke="#6366F1" strokeWidth="1.5" opacity="0.4" />
      <line x1={centerX} y1={centerY} x2={nodeB.x} y2={nodeB.y} stroke="#6366F1" strokeWidth="1.5" opacity="0.4" />

      {/* Animated particles along paths */}
      {particles.map((p, i) => (
        <g key={i}>
          <path d={p.path} fill="none" stroke="none" id={`ppath${i}`} />
          {[0, 0.35, 0.7].map((offset, j) => {
            const phase = ((t * p.speed + offset) % 1);
            return (
              <circle key={j} r="2.5" fill="#6366F1" opacity={0.6 * (1 - Math.abs(phase - 0.5) * 2)}>
                <animateMotion dur={`${2 / p.speed}s`} repeatCount="indefinite" begin={`${-offset * 2 / p.speed}s`}>
                  <mpath href={`#ppath${i}`} />
                </animateMotion>
              </circle>
            );
          })}
        </g>
      ))}

      {/* Node A */}
      <circle cx={nodeA.x} cy={nodeA.y} r="26" fill="url(#nodeGlow)" filter="url(#blur2)" />
      <circle cx={nodeA.x} cy={nodeA.y} r="18" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1.5" />
      <circle cx={nodeA.x} cy={nodeA.y} r="18" fill="none" stroke="#06B6D4" strokeWidth="1.5" opacity="0.6" />
      <circle cx={nodeA.x} cy={nodeA.y} r="4" fill="#10B981">
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={nodeA.x} y={nodeA.y + 32} textAnchor="middle" fontSize="9" fill="#6B7280" fontWeight="600" letterSpacing="0.5">NODE A</text>

      {/* Node B */}
      <circle cx={nodeB.x} cy={nodeB.y} r="26" fill="url(#nodeGlow)" filter="url(#blur2)" />
      <circle cx={nodeB.x} cy={nodeB.y} r="18" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1.5" />
      <circle cx={nodeB.x} cy={nodeB.y} r="18" fill="none" stroke="#06B6D4" strokeWidth="1.5" opacity="0.6" />
      <circle cx={nodeB.x} cy={nodeB.y} r="4" fill="#10B981">
        <animate attributeName="opacity" values="1;0.4;1" dur="2.3s" repeatCount="indefinite" begin="0.4s" />
      </circle>
      <text x={nodeB.x} y={nodeB.y + 32} textAnchor="middle" fontSize="9" fill="#6B7280" fontWeight="600" letterSpacing="0.5">NODE B</text>

      {/* Center ORBIT node */}
      <circle cx={centerX} cy={centerY} r="36" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1.5" />
      <circle cx={centerX} cy={centerY} r="36" fill="none" stroke="#6366F1" strokeWidth="2" strokeDasharray="6 4"
        style={{ transformOrigin: `${centerX}px ${centerY}px`, animation: 'orbit-spin 12s linear infinite' }}
      />
      <text x={centerX} y={centerY - 4} textAnchor="middle" fontSize="11" fill="#6366F1" fontWeight="700" letterSpacing="1">ORBIT</text>
      <circle cx={centerX} cy={centerY + 8} r="3" fill="#6366F1" opacity="0.7">
        <animate attributeName="r" values="3;4;3" dur="1.5s" repeatCount="indefinite" />
      </circle>

      {/* Device markers */}
      {devicePositions.map((d, i) => (
        <g key={i}>
          <circle cx={d.x} cy={d.y} r="14" fill="#FFFFFF" stroke={stateColors[d.state]} strokeWidth="1.5" />
          <circle cx={d.x} cy={d.y} r="5" fill={stateColors[d.state]} opacity="0.85">
            {d.state === 'FLAGGED' && (
              <animate attributeName="opacity" values="0.85;0.3;0.85" dur="1.2s" repeatCount="indefinite" />
            )}
          </circle>
          <text x={d.x} y={d.y + 24} textAnchor="middle" fontSize="7.5" fill="#9CA3AF" fontWeight="500">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Overview() {
  const flaggedCount = devices.filter(d => d.state === 'FLAGGED').length;
  const activeAlerts = alerts.filter(a => !a.resolved).length;
  const totalDevices = devices.length;
  const avgFps = nodes.reduce((s, n) => s + n.framesPerSec, 0) / nodes.length;

  const topDevice = devices.find(d => d.state === 'FLAGGED') || devices[0];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden bg-card rounded-3xl card-shadow-md border border-border/60 p-8">
        <div className="absolute inset-0 bg-dot-grid opacity-30" />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary/5 blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot inline-block" />
              System Status — Operational
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">ORBIT Security Overview</h1>
            <p className="text-muted-foreground text-sm">Real-time wireless environment intelligence</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 bg-status-live-bg border border-status-live/20 rounded-full px-3 py-1.5 text-status-live font-medium text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot" />
              Node A — Live
            </div>
            <div className="flex items-center gap-1.5 bg-status-live-bg border border-status-live/20 rounded-full px-3 py-1.5 text-status-live font-medium text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot" />
              Node B — Live
            </div>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Devices Detected"
          value={totalDevices}
          sub="Active in environment"
          delay={50}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>}
        />
        <MetricCard
          label="Active Alerts"
          value={activeAlerts}
          sub="Unresolved"
          color="text-status-suspicious"
          delay={100}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>}
        />
        <MetricCard
          label="Threats Flagged"
          value={flaggedCount}
          sub="Require attention"
          color="text-status-flagged"
          delay={150}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
        />
        <MetricCard
          label="Frames / sec"
          value={Math.round(avgFps * 10) / 10}
          sub="Avg across nodes"
          delay={200}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        />
        <MetricCard
          label="Node Health"
          value="100%"
          sub="All systems nominal"
          color="text-status-live"
          delay={250}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* Main bento row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Orbit Visualization */}
        <div className="lg:col-span-2 bg-card rounded-3xl card-shadow-md border border-border/60 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground text-sm">Network Intelligence</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Live wireless environment map</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot" />
              Live
            </div>
          </div>
          <div className="h-64 flex items-center justify-center">
            <OrbitVisualization />
          </div>
          <div className="flex items-center gap-4 pt-1 border-t border-border/60 text-xs text-muted-foreground">
            {[
              { color: '#6366F1', label: 'ORBIT Core' },
              { color: '#06B6D4', label: 'Sensor Nodes' },
              { color: '#EF4444', label: 'Flagged' },
              { color: '#F59E0B', label: 'Suspicious' },
              { color: '#9CA3AF', label: 'Unknown' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* Threat Summary */}
        <div className="bg-card rounded-3xl card-shadow-md border border-border/60 p-6 space-y-4 flex flex-col">
          <div>
            <h2 className="font-semibold text-foreground text-sm">Threat Level</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{topDevice.ssid}</p>
          </div>

          {/* Score ring */}
          <div className="flex items-center justify-center py-2">
            <div className="relative">
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#F3F4F6" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40"
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(topDevice.score / 100) * 251.2} 251.2`}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums text-status-flagged">{topDevice.score}</span>
                <span className="text-[10px] text-muted-foreground font-medium">/ 100</span>
              </div>
            </div>
          </div>

          {/* Evidence breakdown */}
          <div className="space-y-2 flex-1">
            {topDevice.evidence.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{e.label}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-status-flagged"
                      style={{ width: `${(e.score / 30) * 100}%` }}
                    />
                  </div>
                  <span className="font-semibold text-status-flagged font-mono w-8 text-right">+{e.score}</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
              <span className="font-medium text-foreground">Total</span>
              <span className="font-bold text-status-flagged font-mono">{topDevice.score}</span>
            </div>
          </div>

          <div className="bg-status-flagged-bg border border-status-flagged/20 rounded-xl p-3 text-xs text-foreground leading-relaxed">
            <span className="font-semibold text-status-flagged">AI Analysis  </span>
            {topDevice.aiNarration}
          </div>
        </div>
      </div>

      {/* Activity strip */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Alerts */}
        <div className="bg-card rounded-3xl card-shadow-md border border-border/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm">Recent Alerts</h2>
            <span className="text-xs text-muted-foreground">{alerts.filter(a => !a.resolved).length} active</span>
          </div>
          <div className="space-y-3">
            {alerts.slice(0, 3).map(a => {
              const colors: Record<string, string> = {
                FLAGGED: 'text-status-flagged bg-status-flagged-bg border-status-flagged/20',
                SUSPICIOUS: 'text-status-suspicious bg-status-suspicious-bg border-status-suspicious/20',
                WATCHING: 'text-status-watching bg-status-watching-bg border-status-watching/20',
              };
              return (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                  <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${colors[a.severity]}`}>
                    {a.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{a.ssid}</div>
                    <div className="text-xs text-muted-foreground">{a.timestamp} · {a.vendor}</div>
                  </div>
                  <div className="text-sm font-bold tabular-nums" style={{ color: a.severity === 'FLAGGED' ? '#EF4444' : '#F59E0B' }}>
                    {a.confidence}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Node activity */}
        <div className="bg-card rounded-3xl card-shadow-md border border-border/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm">Node Activity</h2>
            <span className="text-xs text-muted-foreground">Frames/sec</span>
          </div>
          <div className="space-y-4">
            {nodes.map(n => (
              <div key={n.id} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot" />
                    <span className="font-semibold text-foreground">{n.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">{n.framesPerSec.toFixed(1)} fps</span>
                    <span>Queue: {n.queueDepth}</span>
                  </div>
                </div>
                <div className="flex items-end gap-1 h-8">
                  {n.sparkline.slice(-20).map((v, i) => {
                    const max = Math.max(...n.sparkline);
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-sm"
                        style={{
                          height: `${(v / max) * 100}%`,
                          background: `rgba(99,102,241,${0.2 + (v / max) * 0.6})`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-border/60 grid grid-cols-3 gap-3 text-center text-xs">
            <div>
              <div className="font-bold text-foreground tabular-nums">{nodes.reduce((s, n) => s + n.framesReceived, 0).toLocaleString()}</div>
              <div className="text-muted-foreground">Total Frames</div>
            </div>
            <div>
              <div className="font-bold text-foreground tabular-nums">{(nodes.reduce((s, n) => s + n.framesPerSec, 0)).toFixed(1)}</div>
              <div className="text-muted-foreground">Combined fps</div>
            </div>
            <div>
              <div className="font-bold text-status-live">Nominal</div>
              <div className="text-muted-foreground">System State</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
