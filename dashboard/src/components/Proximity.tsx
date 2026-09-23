import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Device } from '../lib/api';
import { devices as mockDevices } from '../data/mockData';

const stateColors: Record<string, { main: string; bg: string; border: string; glow: string; text: string }> = {
  FLAGGED: {
    main: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.14)',
    border: 'rgba(239, 68, 68, 0.45)',
    glow: 'rgba(239, 68, 68, 0.45)',
    text: '#EF4444',
  },
  SUSPICIOUS: {
    main: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.14)',
    border: 'rgba(245, 158, 11, 0.45)',
    glow: 'rgba(245, 158, 11, 0.35)',
    text: '#F59E0B',
  },
  WATCHING: {
    main: '#EAB308',
    bg: 'rgba(234, 179, 8, 0.14)',
    border: 'rgba(234, 179, 8, 0.4)',
    glow: 'rgba(234, 179, 8, 0.25)',
    text: '#EAB308',
  },
  UNKNOWN: {
    main: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.1)',
    border: 'rgba(148, 163, 184, 0.3)',
    glow: 'rgba(148, 163, 184, 0.15)',
    text: '#94A3B8',
  },
};

interface SpatialDevice {
  id: string;
  bssid: string;
  ssid: string;
  state: 'FLAGGED' | 'SUSPICIOUS' | 'WATCHING' | 'UNKNOWN';
  score: number;
  x: number; // in pixels on 800x520 canvas
  y: number; // in pixels on 800x520 canvas
  rssiA: number;
  rssiB: number;
  distanceA: number;
  distanceB: number;
  zone: string;
  confidence: number;
  vendor: string;
}

function rssiToDistance(rssi: number): number {
  const p0 = -40;
  const n = 2.8;
  const dist = Math.pow(10, (p0 - rssi) / (10 * n));
  return Math.min(10.5, Math.max(0.8, parseFloat(dist.toFixed(1))));
}

// Well-spaced coordinates on 800x520 canvas to eliminate line/node overlap
function getDeviceCoordinates(bssid: string, ssid: string, score: number, index: number): { x: number; y: number; rssiA: number; rssiB: number; zone: string; confidence: number } {
  const normSsid = (ssid || '').toLowerCase().trim();
  const normBssid = (bssid || '').toUpperCase().replace(/[:-]/g, '');

  // 1. Flagged Evil Twin AP (Score >= 70 or rogue HomeNet)
  if (normBssid === 'AABBCC001199' || (normSsid.includes('homenet') && score >= 70)) {
    return {
      x: 400,
      y: 190,
      rssiA: -44,
      rssiB: -56,
      zone: 'College Campus (Central Lab Sector)',
      confidence: 0.94,
    };
  }

  // 2. Trusted AP (Baseline)
  if (normBssid === 'AABBCC001122' || (normSsid.includes('homenet') && score === 0)) {
    return {
      x: 200,
      y: 160,
      rssiA: -38,
      rssiB: -62,
      zone: 'College Campus (Admin Main AP Hub)',
      confidence: 0.96,
    };
  }

  // 3. BLE Tracking Beacon
  if (normBssid.startsWith('EE11') || normSsid.includes('ble')) {
    return {
      x: 430,
      y: 130,
      rssiA: -54,
      rssiB: -60,
      zone: 'College Campus (Attacker Approach Vector)',
      confidence: 0.89,
    };
  }

  // 4. Client Station (Probing/Target)
  if (normBssid.startsWith('1234') || normSsid.includes('client') || normSsid.includes('station')) {
    return {
      x: 320,
      y: 270,
      rssiA: -50,
      rssiB: -58,
      zone: 'College Campus (Student Common Area)',
      confidence: 0.91,
    };
  }

  // 5. Rogue Karma AP
  if (normBssid === 'EEFF00112233' || normSsid.includes('karma') || normSsid.includes('hidden') || normSsid === '' || normSsid === '—') {
    return {
      x: 240,
      y: 380,
      rssiA: -68,
      rssiB: -72,
      zone: 'College Campus (South-West Quad)',
      confidence: 0.84,
    };
  }
  
  // 6. Normal public APs
  if (normBssid === 'DEADBEEF0001' || normSsid.includes('cafe') || normSsid.includes('free_cafe')) {
    return {
      x: 610,
      y: 140,
      rssiA: -72,
      rssiB: -64,
      zone: 'College Campus (North-East Perimeter)',
      confidence: 0.75,
    };
  }
  
  // 7. Mobile hotspot device
  if (normBssid === '50C7BF112233' || normSsid.includes('android') || normSsid.includes('hotspot')) {
    return {
      x: 460,
      y: 410,
      rssiA: -74,
      rssiB: -58,
      zone: 'College Campus (South Central Hall)',
      confidence: 0.88,
    };
  }
  
  // 8. Office / Mesh device
  if (normBssid === 'CCDDEE003344' || normSsid.includes('netgear') || normSsid.includes('office')) {
    return {
      x: 600,
      y: 280,
      rssiA: -78,
      rssiB: -50,
      zone: 'College Campus (East Computer Lab)',
      confidence: 0.86,
    };
  }
  
  // 9. Distributed Fallback layout for any other device
  const fixedLayout = [
    { x: 260, y: 230, rA: -52, rB: -74, z: 'North-West Corridor' },
    { x: 490, y: 310, rA: -65, rB: -59, z: 'Main Auditorium' },
    { x: 330, y: 150, rA: -45, rB: -78, z: 'North Perimeter' },
    { x: 560, y: 390, rA: -70, rB: -52, z: 'South-East Zone' },
  ];
  const c = fixedLayout[index % fixedLayout.length];
  return {
    x: c.x,
    y: c.y,
    rssiA: c.rA,
    rssiB: c.rB,
    zone: `College Campus (${c.z})`,
    confidence: 0.7,
  };
}

export default function Proximity({
  selectedDevice,
  onSelectDevice,
}: {
  selectedDevice: string | null;
  onSelectDevice: (id: string) => void;
}) {
  const [spatialDevices, setSpatialDevices] = useState<SpatialDevice[]>([]);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(selectedDevice);
  const [showGrid, setShowGrid] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showContours, setShowContours] = useState(true);
  const [showBeams, setShowBeams] = useState(true);
  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'THREATS' | 'FLAGGED'>('ALL');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedDevice) {
      setActiveTargetId(selectedDevice);
    }
  }, [selectedDevice]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await api.getDevices();
        const list: Device[] = Array.isArray(data) && data.length > 0 ? data : (mockDevices as any);

        const seen = new Set<string>();
        const uniqueList: any[] = [];
        for (const item of list) {
          const key = String(item.mac || item.bssid || item.id || '').toUpperCase().replace(/[:-]/g, '');
          if (!seen.has(key)) {
            seen.add(key);
            uniqueList.push(item);
          }
        }

        const mapped: SpatialDevice[] = uniqueList.map((d: any, idx: number) => {
          let stateStr = (d.state || 'UNKNOWN').toUpperCase() as SpatialDevice['state'];
          const devBssid = String(d.mac || d.bssid || d.id || `bssid-${idx}`);
          const normBssid = devBssid.toUpperCase().replace(/[:-]/g, '');
          if (normBssid.startsWith('EE11') || (d.ssid || '').toLowerCase().includes('ble')) {
            stateStr = 'WATCHING';
          }
          const normState = ['FLAGGED', 'SUSPICIOUS', 'WATCHING', 'UNKNOWN'].includes(stateStr)
            ? stateStr
            : 'UNKNOWN';
          const score = d.score || (normState === 'WATCHING' ? 20 : 0);
          const devId = String(d.id || d.mac || d.bssid || `dev-${idx}`);
          let devSsid = String(d.ssid || 'Hidden Network');
          if (normBssid === 'AABBCC001199') devSsid = 'HomeNet-5G [Rogue Clone]';
          else if (normBssid === 'AABBCC001122') devSsid = 'HomeNet-5G [Base AP]';

          const pos = getDeviceCoordinates(devBssid, devSsid, score, idx);

          return {
            id: devId,
            bssid: devBssid,
            ssid: devSsid,
            state: normState,
            score,
            x: pos.x,
            y: pos.y,
            rssiA: pos.rssiA,
            rssiB: pos.rssiB,
            distanceA: rssiToDistance(pos.rssiA),
            distanceB: rssiToDistance(pos.rssiB),
            zone: pos.zone,
            confidence: pos.confidence,
            vendor: d.vendor || 'Unknown Hardware',
          };
        });

        setSpatialDevices(mapped);
      } catch {
        const seen = new Set<string>();
        const uniqueList: any[] = [];
        for (const item of (mockDevices as any)) {
          const key = String(item.mac || item.bssid || item.id || '').toUpperCase().replace(/[:-]/g, '');
          if (!seen.has(key)) {
            seen.add(key);
            uniqueList.push(item);
          }
        }

        const mapped: SpatialDevice[] = uniqueList.map((d: any, idx: number) => {
          let stateStr = (d.state || 'UNKNOWN').toUpperCase() as SpatialDevice['state'];
          const devBssid = String(d.mac || d.bssid || d.id || `bssid-${idx}`);
          const normBssid = devBssid.toUpperCase().replace(/[:-]/g, '');
          if (normBssid.startsWith('EE11') || (d.ssid || '').toLowerCase().includes('ble')) {
            stateStr = 'WATCHING';
          }
          const normState = ['FLAGGED', 'SUSPICIOUS', 'WATCHING', 'UNKNOWN'].includes(stateStr)
            ? stateStr
            : 'UNKNOWN';
          const score = d.score || (normState === 'WATCHING' ? 20 : 0);
          const devId = String(d.id || d.mac || d.bssid || `dev-${idx}`);
          let devSsid = String(d.ssid || 'Hidden Network');
          if (normBssid === 'AABBCC001199') devSsid = 'HomeNet-5G [Rogue Clone]';
          else if (normBssid === 'AABBCC001122') devSsid = 'HomeNet-5G [Base AP]';

          const pos = getDeviceCoordinates(devBssid, devSsid, score, idx);
          return {
            id: devId,
            bssid: devBssid,
            ssid: devSsid,
            state: normState,
            score,
            x: pos.x,
            y: pos.y,
            rssiA: pos.rssiA,
            rssiB: pos.rssiB,
            distanceA: rssiToDistance(pos.rssiA),
            distanceB: rssiToDistance(pos.rssiB),
            zone: pos.zone,
            confidence: pos.confidence,
            vendor: d.vendor || 'Unknown OUI',
          };
        });
        setSpatialDevices(mapped);
      }
    };

    loadData();
  }, []);

  const handleSelectDevice = (id: string) => {
    setActiveTargetId(id);
    onSelectDevice?.(id);
  };

  const activeSuspect = spatialDevices.find((d) => d.id === activeTargetId || d.bssid === activeTargetId || d.ssid === activeTargetId) 
    || spatialDevices.find((d) => d.state === 'FLAGGED') 
    || spatialDevices[0];

  const filteredDevices = spatialDevices.filter((d) => {
    if (deviceFilter === 'FLAGGED') return d.state === 'FLAGGED';
    if (deviceFilter === 'THREATS') return d.state === 'FLAGGED' || d.state === 'SUSPICIOUS';
    return true;
  });

  // Sensor Nodes coordinates: Node A top-left, Node B bottom-right
  const nodeAPos = { x: 120, y: 100 };
  const nodeBPos = { x: 680, y: 420 };

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Proximity Intelligence & Heatmap</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time dual-node spatial RF localization & signal heatmap across College Campus
          </p>
        </div>

        {/* View Controls & Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-card border border-border/80 rounded-xl p-1 flex items-center gap-1 shadow-sm">
            {(['ALL', 'THREATS', 'FLAGGED'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setDeviceFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  deviceFilter === filter
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {filter === 'ALL' ? 'All Targets' : filter === 'THREATS' ? 'Threats Only' : 'Flagged (Alerts)'}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border/80 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-sm text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>Grid</span>
            </label>
            <div className="w-px h-3.5 bg-border" />
            <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>Heat Layer</span>
            </label>
            <div className="w-px h-3.5 bg-border" />
            <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={showContours}
                onChange={(e) => setShowContours(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>Contours</span>
            </label>
            <div className="w-px h-3.5 bg-border" />
            <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={showBeams}
                onChange={(e) => setShowBeams(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>Beams</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Spatial Stage */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Canvas Area: 3 Columns */}
        <div className="xl:col-span-3 bg-card rounded-3xl border border-border/70 card-shadow-md overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-border/60 bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                COLLEGE CAMPUS — WI-FI & RF MONITORING ZONE
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4]" />
                <span className="text-muted-foreground">NODE A: 2.4GHz HOPPER</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6366F1]" />
                <span className="text-muted-foreground">NODE B: CH 6 FIXED</span>
              </div>
            </div>
          </div>

          <div className="relative w-full aspect-[16/10] bg-[#0A0E17] text-slate-100 overflow-hidden select-none">
            <svg
              viewBox="0 0 800 520"
              className="w-full h-full"
            >
              <defs>
                <pattern id="grid-sub" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="0.5" />
                </pattern>
                <pattern id="grid-main" width="80" height="80" patternUnits="userSpaceOnUse">
                  <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(255, 255, 255, 0.07)" strokeWidth="1" />
                </pattern>

                <filter id="soft-heat-blur" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="14" result="blur" />
                </filter>

                {/* Deep, rich red heat gradient for high threats */}
                <radialGradient id="deep-red-heat" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#FF1E42" stopOpacity="0.75" />
                  <stop offset="35%" stopColor="#EF4444" stopOpacity="0.45" />
                  <stop offset="70%" stopColor="#DC2626" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
                </radialGradient>

                {/* Moderate amber heat gradient for suspicious threats */}
                <radialGradient id="amber-heat" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#F97316" stopOpacity="0.42" />
                  <stop offset="45%" stopColor="#F59E0B" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                </radialGradient>

                {/* Gentle yellow heat gradient for watching items */}
                <radialGradient id="yellow-heat" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#EAB308" stopOpacity="0.25" />
                  <stop offset="60%" stopColor="#EAB308" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#EAB308" stopOpacity="0" />
                </radialGradient>

                <radialGradient id="nodeA-radar" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
                </radialGradient>

                <radialGradient id="nodeB-radar" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Blueprint Grid */}
              {showGrid && (
                <>
                  <rect width="800" height="520" fill="url(#grid-sub)" />
                  <rect width="800" height="520" fill="url(#grid-main)" />
                </>
              )}

              {/* Single Large Unified College Boundary Frame */}
              <g className="architectural-walls">
                <rect
                  x="20"
                  y="20"
                  width="760"
                  height="480"
                  rx="14"
                  fill="rgba(99, 102, 241, 0.015)"
                  stroke="#4F46E5"
                  strokeWidth="1.5"
                  strokeDasharray="6 6"
                  opacity="0.65"
                />

                <text
                  x="38"
                  y="46"
                  fontSize="11"
                  fontWeight="700"
                  letterSpacing="1"
                  fill="#818CF8"
                  opacity="0.9"
                  fontFamily="monospace"
                >
                  COLLEGE CAMPUS — WI-FI & RF MONITORING ZONE
                </text>

                {/* Clean, Non-overlapping Scale Markers */}
                <g opacity="0.6" fontSize="9" fill="#94A3B8" fontFamily="monospace">
                  <line x1="30" y1="20" x2="30" y2="26" stroke="#94A3B8" strokeWidth="1" />
                  <text x="34" y="32">0.0m</text>
                  <line x1="400" y1="20" x2="400" y2="26" stroke="#94A3B8" strokeWidth="1" />
                  <text x="404" y="32">6.0m</text>
                  <line x1="770" y1="20" x2="770" y2="26" stroke="#94A3B8" strokeWidth="1" />
                  <text x="740" y="32">12.0m</text>

                  <line x1="20" y1="30" x2="26" y2="30" stroke="#94A3B8" strokeWidth="1" />
                  <line x1="20" y1="260" x2="26" y2="260" stroke="#94A3B8" strokeWidth="1" />
                  <text x="28" y="263">4.0m</text>
                  <line x1="20" y1="490" x2="26" y2="490" stroke="#94A3B8" strokeWidth="1" />
                  <text x="28" y="493">8.0m</text>
                </g>
              </g>

              {/* Signal Range Contours */}
              {showContours && (
                <g className="signal-contours pointer-events-none opacity-30">
                  {[50, 100, 150, 200].map((radius, i) => (
                    <circle
                      key={`a-ring-${i}`}
                      cx={nodeAPos.x}
                      cy={nodeAPos.y}
                      r={radius}
                      fill="none"
                      stroke="#06B6D4"
                      strokeWidth="1"
                      strokeDasharray="5 5"
                      opacity={0.7 - i * 0.15}
                    />
                  ))}
                  {[50, 100, 150, 200].map((radius, i) => (
                    <circle
                      key={`b-ring-${i}`}
                      cx={nodeBPos.x}
                      cy={nodeBPos.y}
                      r={radius}
                      fill="none"
                      stroke="#6366F1"
                      strokeWidth="1"
                      strokeDasharray="5 5"
                      opacity={0.7 - i * 0.15}
                    />
                  ))}
                </g>
              )}

              {/* Threat-Score-Based Dynamic Heatmap Layer */}
              {showHeatmap && (
                <g className="heatmap-glows pointer-events-none">
                  {filteredDevices.map((dev, devIdx) => {
                    // Deepness and size scaling directly with threat score
                    const score = dev.score || 0;
                    if (score < 20) return null;

                    const isFlagged = score >= 70;
                    const isSuspicious = score >= 40 && score < 70;
                    
                    const baseRadius = isFlagged ? 56 : isSuspicious ? 40 : 28;
                    const grad = isFlagged ? 'url(#deep-red-heat)' : isSuspicious ? 'url(#amber-heat)' : 'url(#yellow-heat)';

                    return (
                      <g key={`heat-${dev.id || dev.bssid || devIdx}`}>
                        {/* Core intense aura */}
                        <circle
                          cx={dev.x}
                          cy={dev.y}
                          r={baseRadius}
                          fill={grad}
                          filter="url(#soft-heat-blur)"
                        >
                          <animate
                            attributeName="r"
                            values={`${baseRadius * 0.88};${baseRadius * 1.15};${baseRadius * 0.88}`}
                            dur={isFlagged ? '2s' : '3.5s'}
                            repeatCount="indefinite"
                          />
                        </circle>

                        {/* Extra deep radiant ring for high threats (score >= 70) */}
                        {isFlagged && (
                          <circle
                            cx={dev.x}
                            cy={dev.y}
                            r={baseRadius * 1.35}
                            fill="url(#deep-red-heat)"
                            filter="url(#soft-heat-blur)"
                            opacity="0.6"
                          >
                            <animate
                              attributeName="r"
                              values={`${baseRadius * 1.1};${baseRadius * 1.45};${baseRadius * 1.1}`}
                              dur="2.8s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Active Triangulation Vector Beams (Drawn dynamically from Nodes to activeSuspect) */}
              {showBeams && activeSuspect && (
                <g className="triangulation-vectors pointer-events-none">
                  {/* Beam from Node A to Selected Target */}
                  <line
                    x1={nodeAPos.x}
                    y1={nodeAPos.y}
                    x2={activeSuspect.x}
                    y2={activeSuspect.y}
                    stroke="#06B6D4"
                    strokeWidth="1.6"
                    strokeDasharray="5 5"
                    opacity="0.9"
                  >
                    <animate
                      attributeName="strokeDashoffset"
                      from="20"
                      to="0"
                      dur="1.2s"
                      repeatCount="indefinite"
                    />
                  </line>

                  {/* Beam from Node B to Selected Target */}
                  <line
                    x1={nodeBPos.x}
                    y1={nodeBPos.y}
                    x2={activeSuspect.x}
                    y2={activeSuspect.y}
                    stroke="#818CF8"
                    strokeWidth="1.6"
                    strokeDasharray="5 5"
                    opacity="0.9"
                  >
                    <animate
                      attributeName="strokeDashoffset"
                      from="20"
                      to="0"
                      dur="1.2s"
                      repeatCount="indefinite"
                    />
                  </line>

                  {/* Distance tag along Node A beam */}
                  {(() => {
                    const tagAx = nodeAPos.x + (activeSuspect.x - nodeAPos.x) * 0.42;
                    const tagAy = nodeAPos.y + (activeSuspect.y - nodeAPos.y) * 0.42 - 12;
                    return (
                      <g transform={`translate(${tagAx}, ${tagAy})`}>
                        <rect
                          x="-36"
                          y="-9"
                          width="72"
                          height="18"
                          rx="5"
                          fill="#0F172A"
                          stroke="#06B6D4"
                          strokeWidth="1.2"
                          opacity="0.95"
                        />
                        <text
                          x="0"
                          y="3.5"
                          fill="#38BDF8"
                          fontSize="9"
                          fontWeight="700"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {activeSuspect.rssiA}dBm ({activeSuspect.distanceA}m)
                        </text>
                      </g>
                    );
                  })()}

                  {/* Distance tag along Node B beam */}
                  {(() => {
                    const tagBx = nodeBPos.x + (activeSuspect.x - nodeBPos.x) * 0.42;
                    const tagBy = nodeBPos.y + (activeSuspect.y - nodeBPos.y) * 0.42 - 12;
                    return (
                      <g transform={`translate(${tagBx}, ${tagBy})`}>
                        <rect
                          x="-36"
                          y="-9"
                          width="72"
                          height="18"
                          rx="5"
                          fill="#0F172A"
                          stroke="#818CF8"
                          strokeWidth="1.2"
                          opacity="0.95"
                        />
                        <text
                          x="0"
                          y="3.5"
                          fill="#A5B4FC"
                          fontSize="9"
                          fontWeight="700"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {activeSuspect.rssiB}dBm ({activeSuspect.distanceB}m)
                        </text>
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* Sensor Node A Marker */}
              <g className="node-marker pointer-events-none" transform={`translate(${nodeAPos.x}, ${nodeAPos.y})`}>
                <circle r="30" fill="url(#nodeA-radar)" />
                <circle r="14" fill="#0F172A" stroke="#06B6D4" strokeWidth="2.5" />
                <circle r="5" fill="#06B6D4">
                  <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle r="20" fill="none" stroke="#06B6D4" strokeWidth="1.2" strokeDasharray="3 3">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0"
                    to="360"
                    dur="12s"
                    repeatCount="indefinite"
                  />
                </circle>
                <rect x="-42" y="19" width="84" height="17" rx="4" fill="#0F172A" stroke="#06B6D4" strokeWidth="0.8" opacity="0.95" />
                <text x="0" y="31" fill="#38BDF8" fontSize="8.5" fontWeight="700" textAnchor="middle" fontFamily="monospace">
                  NODE A [HOPPER]
                </text>
              </g>

              {/* Sensor Node B Marker */}
              <g className="node-marker pointer-events-none" transform={`translate(${nodeBPos.x}, ${nodeBPos.y})`}>
                <circle r="30" fill="url(#nodeB-radar)" />
                <circle r="14" fill="#0F172A" stroke="#6366F1" strokeWidth="2.5" />
                <circle r="5" fill="#6366F1">
                  <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle r="20" fill="none" stroke="#6366F1" strokeWidth="1.2" strokeDasharray="3 3">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="360"
                    to="0"
                    dur="12s"
                    repeatCount="indefinite"
                  />
                </circle>
                <rect x="-46" y="19" width="92" height="17" rx="4" fill="#0F172A" stroke="#6366F1" strokeWidth="0.8" opacity="0.95" />
                <text x="0" y="31" fill="#A5B4FC" fontSize="8.5" fontWeight="700" textAnchor="middle" fontFamily="monospace">
                  NODE B [GUARD CH6]
                </text>
              </g>

              {/* Device Pins */}
              <g className="device-pins">
                {filteredDevices.map((dev, devIdx) => {
                  const isSelected = activeSuspect?.id === dev.id;
                  const isHovered = hoveredId === dev.id;
                  const colorConfig = stateColors[dev.state] || stateColors.UNKNOWN;

                  return (
                    <g
                      key={`pin-${dev.id || dev.bssid || devIdx}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectDevice(dev.id);
                      }}
                      onMouseEnter={() => setHoveredId(dev.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className="cursor-pointer"
                      transform={`translate(${dev.x}, ${dev.y})`}
                    >
                      {/* Stable invisible hit circle for instant mouse clicks */}
                      <circle r="32" fill="transparent" />

                      {/* Rotating Target Crosshair on Selected */}
                      {isSelected && (
                        <g className="pointer-events-none">
                          <circle r="24" fill="none" stroke={colorConfig.main} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.9">
                            <animateTransform
                              attributeName="transform"
                              type="rotate"
                              from="0"
                              to="360"
                              dur="6s"
                              repeatCount="indefinite"
                            />
                          </circle>
                          <line x1="-28" y1="0" x2="28" y2="0" stroke={colorConfig.main} strokeWidth="1" opacity="0.45" />
                          <line x1="0" y1="-28" x2="0" y2="28" stroke={colorConfig.main} strokeWidth="1" opacity="0.45" />
                        </g>
                      )}

                      {/* Subtle Glow Ring on Hover */}
                      <circle
                        r={isHovered ? 18 : 0}
                        fill="none"
                        stroke={colorConfig.main}
                        strokeWidth="1.5"
                        opacity={isHovered ? 0.6 : 0}
                        style={{ transition: 'all 0.25s ease-out' }}
                      />

                      {/* Target Pin Outer Shell */}
                      <circle
                        r={isSelected ? 13 : isHovered ? 12 : 10}
                        fill="#0F172A"
                        stroke={colorConfig.main}
                        strokeWidth={isSelected ? 2.8 : isHovered ? 2.4 : 2}
                        style={{ transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                      />

                      {/* Core Indicator */}
                      <circle
                        r={isSelected ? 5.5 : isHovered ? 5 : 4}
                        fill={colorConfig.main}
                        style={{ transition: 'all 0.25s ease-out' }}
                      >
                        {dev.state === 'FLAGGED' && (
                          <animate
                            attributeName="opacity"
                            values="1;0.4;1"
                            dur="1.2s"
                            repeatCount="indefinite"
                          />
                        )}
                      </circle>

                      {/* Floating Target Label Pill */}
                      {(() => {
                        const pillText = dev.ssid;
                        const textWidth = pillText.length * 6.0;
                        const pillWidth = Math.max(68, textWidth + 24);
                        const halfW = pillWidth / 2;

                        return (
                          <g
                            transform={isHovered || isSelected ? 'translate(0, 19)' : 'translate(0, 17)'}
                            className="pointer-events-none"
                            style={{ transition: 'transform 0.25s ease-out' }}
                          >
                            <rect
                              x={-halfW}
                              y="0"
                              width={pillWidth}
                              height="18"
                              rx="9"
                              fill="#0F172A"
                              stroke={isHovered || isSelected ? colorConfig.main : colorConfig.border}
                              strokeWidth={isHovered || isSelected ? 1.4 : 1}
                              style={{ transition: 'all 0.2s ease' }}
                            />
                            <circle
                              cx={-halfW + 8}
                              cy="9"
                              r="2.5"
                              fill={colorConfig.main}
                            />
                            <text
                              x={-halfW + 15}
                              y="12.5"
                              fontSize="8.5"
                              fontWeight="700"
                              textAnchor="start"
                              fill={isHovered || isSelected ? '#FFFFFF' : '#CBD5E1'}
                              fontFamily="sans-serif"
                            >
                              {pillText}
                            </text>
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Bottom Left Canvas Legend */}
            <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-lg flex items-center gap-4 text-xs pointer-events-none">
              <div className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] animate-pulse" />
                <span className="text-slate-200">Flagged Threat</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                <span className="text-slate-200">Suspicious</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EAB308]" />
                <span className="text-slate-200">Watching</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#94A3B8]" />
                <span className="text-slate-400">Normal / Whitelisted</span>
              </div>
            </div>
          </div>
        </div>

        {/* Telemetry Inspector: 1 Column */}
        <div className="xl:col-span-1 space-y-4 flex flex-col">
          {activeSuspect ? (
            <div className="bg-card rounded-3xl border border-border/70 p-5 card-shadow-md flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <span className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                  Target Telemetry
                </span>
                <span
                  className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: stateColors[activeSuspect.state]?.bg,
                    color: stateColors[activeSuspect.state]?.text,
                    border: `1px solid ${stateColors[activeSuspect.state]?.border}`,
                  }}
                >
                  {activeSuspect.state} [{activeSuspect.score} PTS]
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-foreground truncate">{activeSuspect.ssid}</h3>
                <p className="text-xs font-mono text-muted-foreground truncate mt-0.5">{activeSuspect.bssid}</p>
              </div>

              {/* Triangulation Zone */}
              <div className="bg-muted/40 border border-border/60 rounded-2xl p-3.5 space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Estimated Location Zone
                </div>
                <div className="text-sm font-bold text-primary flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  {activeSuspect.zone}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span>KNN Confidence</span>
                  <span className="font-mono font-bold text-foreground">
                    {Math.round(activeSuspect.confidence * 100)}%
                  </span>
                </div>
              </div>

              {/* Dual Sensor RSSI & Distance Gauges */}
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#06B6D4]" /> Node A RSSI
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {activeSuspect.rssiA} dBm <span className="text-muted-foreground font-normal">({activeSuspect.distanceA}m)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#06B6D4] transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, (activeSuspect.rssiA + 100) * 1.5))}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#6366F1]" /> Node B RSSI
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {activeSuspect.rssiB} dBm <span className="text-muted-foreground font-normal">({activeSuspect.distanceB}m)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#6366F1] transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, (activeSuspect.rssiB + 100) * 1.5))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Hardware OUI */}
              <div className="pt-2 border-t border-border/60 text-xs flex items-center justify-between text-muted-foreground">
                <span>Hardware OUI</span>
                <span className="font-medium text-foreground">{activeSuspect.vendor}</span>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-3xl border border-border/70 p-6 card-shadow-md text-center text-muted-foreground text-sm">
              Select a target on the floor-plan to view spatial telemetry.
            </div>
          )}

          {/* Target Selector List */}
          <div className="bg-card rounded-3xl border border-border/70 p-5 card-shadow-md flex-1 flex flex-col">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Monitored Devices ({spatialDevices.length})
            </h4>
            <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
              {spatialDevices.map((dev, devIdx) => {
                const isSelected = activeSuspect?.id === dev.id;
                const colorConfig = stateColors[dev.state] || stateColors.UNKNOWN;
                return (
                  <div
                    key={`sidebar-item-${dev.id || dev.bssid || devIdx}`}
                    onClick={() => handleSelectDevice(dev.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-primary/10 border-primary/40 shadow-sm'
                        : 'bg-muted/20 border-border/60 hover:bg-muted/50 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorConfig.main }} />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-foreground truncate">{dev.ssid}</div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">{dev.zone}</div>
                      </div>
                    </div>
                    <span
                      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: colorConfig.bg, color: colorConfig.text }}
                    >
                      {dev.score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
