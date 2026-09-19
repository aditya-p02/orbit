import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Device, ProximityDevice } from '../lib/api';

const stateColors: Record<string, string> = {
  FLAGGED: '#EF4444',
  SUSPICIOUS: '#F59E0B',
  WATCHING: '#EAB308',
  UNKNOWN: '#9CA3AF',
};

function mapBackendDevice(d: any): Device {
  return {
    id: d.mac,
    bssid: d.mac,
    ssid: d.ssid || '—',
    vendor: d.vendor || 'unknown',
    state: (d.state || 'Unknown').toUpperCase(),
    score: d.score || 0,
    lastSeen: d.last_seen ? new Date(d.last_seen * 1000).toLocaleTimeString() : '—',
    channel: d.channel || 0,
    rssi: d.rssi || -80,
    evidence: [],
    aiNarration: 'No additional analysis available.',
  };
}

function mapProximityDevice(d: Device): ProximityDevice {
  // Use deterministic position based on RSSI
  const x = Math.min(90, Math.max(10, 50 + (d.rssi + 70) * 1.5));
  const y = Math.min(80, Math.max(10, 50 - (d.rssi + 70) * 1.2));
  return {
    id: d.id,
    ssid: d.ssid,
    state: d.state as ProximityDevice['state'],
    x,
    y,
    rssiA: d.rssi,
    rssiB: d.rssi,
  };
}

export default function Proximity({ selectedDevice, onSelectDevice }: { selectedDevice: string | null; onSelectDevice: (id: string) => void }) {
  const [proximityDevices, setProximityDevices] = useState<ProximityDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 50);
    return () => clearInterval(id);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const deviceData = await api.getDevices();
      const mapped = deviceData.map(mapBackendDevice);
      setProximityDevices(mapped.map(mapProximityDevice));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load proximity data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading proximity map...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="bg-status-flagged-bg border border-status-flagged/20 rounded-2xl p-4 text-status-flagged">
          <div className="font-semibold">Error loading proximity map</div>
          <div className="text-sm mt-1">{error}</div>
          <button onClick={fetchData} className="mt-3 text-xs text-primary hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  const centerX = 200;
  const centerY = 180;
  const nodeA = { x: centerX - 110, y: centerY - 50 };
  const nodeB = { x: centerX + 115, y: centerY - 40 };

  const particles = [
    { path: `M${nodeA.x},${nodeA.y} Q${centerX - 55},${centerY - 20} ${centerX},${centerY}`, speed: 0.8 },
    { path: `M${nodeB.x},${nodeB.y} Q${centerX + 55},${centerY - 20} ${centerX},${centerY}`, speed: 1.1 },
  ];

  const t = (tick * 50) / 1000;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Proximity Map</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Live device positioning via RSSI triangulation</p>
      </div>

      <div className="bg-card rounded-3xl card-shadow-md border border-border/60 p-6">
        <div className="relative h-80 flex items-center justify-center">
          <svg viewBox="0 0 400 360" className="w-full h-full" style={{ overflow: 'visible' }}>
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

            {/* Connection lines from center to nodes */}
            <line x1={centerX} y1={centerY} x2={nodeA.x} y2={nodeA.y} stroke="#6366F1" strokeWidth="1.5" opacity="0.4" />
            <line x1={centerX} y1={centerY} x2={nodeB.x} y2={nodeB.y} stroke="#6366F1" strokeWidth="1.5" opacity="0.4" />

            {/* Animated particles along paths to center */}
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

            {/* Device markers - use proximity positions or fallback to mock */}
            {proximityDevices.map((d) => {
              // Map proximity x,y (0-100%) to SVG coordinates
              const svgX = centerX - 110 + (d.x / 100) * 220;
              const svgY = centerY + 80 - (d.y / 100) * 160;
              const color = stateColors[d.state];
              const isSelected = selectedDevice === d.id;

              return (
                <g key={d.id} onClick={() => onSelectDevice(d.id)} style={{ cursor: isSelected ? 'default' : 'pointer' }}>
                  <circle cx={svgX} cy={svgY} r={isSelected ? 16 : 14} fill="#FFFFFF" stroke={color} strokeWidth={isSelected ? 2 : 1.5} />
                  <circle cx={svgX} cy={svgY} r={isSelected ? 7 : 5} fill={color} opacity={d.state === 'FLAGGED' ? 0.85 : 0.75}>
                    {d.state === 'FLAGGED' && (
                      <animate attributeName="opacity" values="0.85;0.3;0.85" dur="1.2s" repeatCount="indefinite" />
                    )}
                  </circle>
                  <text x={svgX} y={svgY + 24} textAnchor="middle" fontSize="7.5" fill="#9CA3AF" fontWeight="500">{d.ssid}</text>
                  {isSelected && (
                    <circle cx={svgX} cy={svgY} r={isSelected ? 18 : 16} fill="none" stroke="#6366F1" strokeWidth="2" strokeDasharray="4 4" opacity="0.8">
                      <animate attributeName="strokeDashoffset" from="0" to="50" dur="1s" repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              );
            })}

            {/* RSSI rings for Node A */}
            {[3, 6, 9].map(dist => (
              <circle
                key={`ringA-${dist}`}
                cx={nodeA.x} cy={nodeA.y}
                r={dist * 22}
                fill="none"
                stroke="#6366F1"
                strokeWidth="0.5"
                strokeDasharray="4 8"
                opacity="0.15"
              />
            ))}

            {/* RSSI rings for Node B */}
            {[3, 6, 9].map(dist => (
              <circle
                key={`ringB-${dist}`}
                cx={nodeB.x} cy={nodeB.y}
                r={dist * 22}
                fill="none"
                stroke="#06B6D4"
                strokeWidth="0.5"
                strokeDasharray="4 8"
                opacity="0.1"
              />
            ))}
          </svg>
        </div>

        <div className="flex items-center gap-4 pt-4 border-t border-border/60 text-xs text-muted-foreground">
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

      {/* Device list sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-card rounded-2xl card-shadow-md border border-border/60 p-4">
          <h2 className="font-semibold text-foreground text-sm mb-3">Device Positions</h2>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {proximityDevices.map(d => (
              <div
                key={d.id}
                onClick={() => onSelectDevice(d.id)}
                className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors hover:bg-muted ${selectedDevice === d.id ? 'bg-secondary/50' : ''}`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: stateColors[d.state] }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{d.ssid}</div>
                  <div className="text-xs text-muted-foreground">{d.rssiA}dB / {d.rssiB}dB</div>
                </div>
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {d.state}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-card rounded-2xl card-shadow-md border border-border/60 p-4">
          <h2 className="font-semibold text-foreground text-sm mb-3">Node RSSI</h2>
          <div className="space-y-3">
            {[
              { label: 'Node A', rssi: proximityDevices[0]?.rssiA ?? -62, color: '#6366F1' },
              { label: 'Node B', rssi: proximityDevices[0]?.rssiB ?? -74, color: '#06B6D4' },
            ].map(n => (
              <div key={n.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-foreground">{n.label}</span>
                  <span className="font-mono text-foreground" style={{ color: n.color }}>{n.rssi} dBm</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, (n.rssi + 100) * 2))}%`,
                      background: n.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}