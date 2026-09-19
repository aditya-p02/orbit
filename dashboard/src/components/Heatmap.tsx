import { useState, useRef, useEffect, useCallback } from 'react'
import type { Device, NodeStat } from '../data'
import { stateForScore, stateColor } from '../data'
import { Panel } from './ui'

// Room dimensions (meters) - for a typical lab/office space
const ROOM_WIDTH = 12 // meters
const ROOM_HEIGHT = 8  // meters
const NODE_A_POS = { x: 1.5, y: 1.2 }  // Node A position (meters from bottom-left)
const NODE_B_POS = { x: 10.5, y: 6.8 } // Node B position

// Wall definitions: { x1, y1, x2, y2 } in meters
const WALLS = [
  // Outer walls
  { x1: 0, y1: 0, x2: ROOM_WIDTH, y2: 0 },      // bottom
  { x1: ROOM_WIDTH, y1: 0, x2: ROOM_WIDTH, y2: ROOM_HEIGHT }, // right
  { x1: ROOM_WIDTH, y1: ROOM_HEIGHT, x2: 0, y2: ROOM_HEIGHT }, // top
  { x1: 0, y1: ROOM_HEIGHT, x2: 0, y2: 0 },      // left
  // Inner walls / obstacles
  { x1: 3, y1: 0, x2: 3, y2: 2.5 },              // vertical partition
  { x1: 6, y1: 3, x2: 9, y2: 3 },                // horizontal partition
  { x1: 9, y1: 5, x2: 9, y2: 8 },                // vertical partition right side
]

// Door openings (gaps in walls)
const DOORS = [
  { wall: 0, start: 4, end: 5.2 },  // bottom wall door
  { wall: 2, start: 2, end: 3.2 },  // top wall door
  { wall: 4, start: 0, end: 1.2 },  // left partition door
]

interface ThreatZone {
  bssid: string
  ssid: string
  x: number      // 0-1 normalized
  y: number      // 0-1 normalized
  score: number
  confidence: number
  color: string
  rssiA: number
  rssiB: number
}

function metersToPercent(x: number, y: number) {
  return { x: (x / ROOM_WIDTH) * 100, y: (1 - y / ROOM_HEIGHT) * 100 } // flip Y for CSS
}

// function rssiToRadius(rssi: number): number {
//   // Convert RSSI to approximate radius in meters (log-distance path loss model)
//   // Rough: -30dBm = 1m, -60dBm = 10m, -90dBm = 100m
//   return Math.max(0.5, Math.min(8, Math.pow(10, (-rssi - 30) / 20)))
// }

function getRSSI(device: Device): number {
  // In real deployment, devices would have per-node RSSI
  // For now, estimate from score/distance
  const baseRSSI = -40 - (device.score / 10) * 5
  return baseRSSI + (Math.random() - 0.5) * 6
}

export default function Heatmap({ 
  devices, 
  nodes,
  selected, 
  onSelect 
}: { 
  devices: Device[] 
  nodes: NodeStat[]
  selected: string | null
  onSelect: (bssid: string | null) => void
}) {
  const threats = devices.filter(d => d.score >= 40 && !d.resolved)
  
  const threatZones: ThreatZone[] = threats.map(d => {
    const rssiA = getRSSI(d)
    const rssiB = getRSSI(d)
    const color = stateColor[stateForScore(d.score)]
    
    // Triangulate position from RSSI (simplified - real version uses KNN fingerprinting)
    // Weighted toward stronger signal node
    const weightA = Math.pow(10, -rssiA / 10)
    const weightB = Math.pow(10, -rssiB / 10)
    const totalWeight = weightA + weightB
    
    const estX = (NODE_A_POS.x * weightA + NODE_B_POS.x * weightB) / totalWeight
    const estY = (NODE_A_POS.y * weightA + NODE_B_POS.y * weightB) / totalWeight
    
    const { x, y } = metersToPercent(estX, estY)
    
    return {
      bssid: d.bssid,
      ssid: d.ssid,
      x, y,
      score: d.score,
      confidence: d.score >= 70 ? 0.85 : d.score >= 40 ? 0.6 : 0.3,
      color,
      rssiA,
      rssiB,
    }
  })

  // --- Zoom/Pan state ---
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const mapRef = useRef<HTMLDivElement>(null)

  // Zoom with wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const mouseX = e.clientX - rect.left - translate.x
    const mouseY = e.clientY - rect.top - translate.y
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.5, Math.min(4, scale * zoomFactor))
    
    // Zoom towards mouse position
    const newTranslate = {
      x: e.clientX - rect.left - (mouseX * newScale / scale),
      y: e.clientY - rect.top - (mouseY * newScale / scale)
    }
    
    // Clamp translation to keep map in view
    const mapWidth = rect.width * newScale
    const mapHeight = rect.height * newScale
    newTranslate.x = Math.min(0, Math.max(rect.width - mapWidth, newTranslate.x))
    newTranslate.y = Math.min(0, Math.max(rect.height - mapHeight, newTranslate.y))
    
    setScale(newScale)
    setTranslate(newTranslate)
  }, [scale, translate])

  // Pan with mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return // only left click
    setIsPanning(true)
    setPanStart({ x: e.clientX - translate.x, y: e.clientY - translate.y })
    e.preventDefault()
  }, [translate])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning) return
      setTranslate({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      })
    }
    const handleMouseUp = () => setIsPanning(false)
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isPanning, panStart])

  // Keyboard zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setScale(s => Math.min(4, s * 1.2))
      } else if (e.key === '-') {
        e.preventDefault()
        setScale(s => Math.max(0.5, s / 1.2))
      } else if (e.key === '0') {
        e.preventDefault()
        setScale(1)
        setTranslate({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <Panel title="Proximity Heatmap" hint={`${threats.length} threat${threats.length !== 1 ? 's' : ''} triangulated`} className="h-full">
      <div className="h-full p-4">
        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px] text-[color:var(--color-dim)]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--color-phosphor)' }} />
            <span>Node A (ch-hop)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--color-suspicious)' }} />
            <span>Node B (fixed)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-3 rounded-full" style={{ 
              background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-flagged) 40%, transparent))' 
            }} />
            <span>High confidence</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-3 rounded-full" style={{ 
              background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-suspicious) 30%, transparent))' 
            }} />
            <span>Medium confidence</span>
          </div>
        </div>

        {/* Floor plan */}
        <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-elevated)]">
          <div
            ref={mapRef}
            className="absolute inset-0"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: 'top left',
              cursor: isPanning ? 'grabbing' : 'grab',
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
          >
            {/* Grid background */}
            <svg viewBox={`0 0 ${ROOM_WIDTH} ${ROOM_HEIGHT}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              {/* Grid pattern */}
              <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
                <path d="M1 0H0V1" fill="none" stroke="var(--color-line)" strokeWidth="0.02" opacity="0.3" />
              </pattern>
              <pattern id="gridMajor" width="2" height="2" patternUnits="userSpaceOnUse">
                <path d="M2 0H0V2" fill="none" stroke="var(--color-line-bright)" strokeWidth="0.03" opacity="0.4" />
              </pattern>
              {/* Wall pattern */}
              <pattern id="wallHatch" width="4" height="4" patternUnits="userSpaceOnUse">
                <path d="M0,4 L4,0 M-1,1 L1,-1 M3,5 L5,3" fill="none" stroke="var(--color-faint)" strokeWidth="0.5" opacity="0.6" />
              </pattern>
            </defs>
            
            {/* Floor area with grid */}
            <rect x="0" y="0" width={ROOM_WIDTH} height={ROOM_HEIGHT} fill="url(#grid)" />
            <rect x="0" y="0" width={ROOM_WIDTH} height={ROOM_HEIGHT} fill="url(#gridMajor)" />
            
            {/* Walls */}
            <g stroke="var(--color-line-bright)" strokeWidth="0.08" strokeLinecap="round">
              {WALLS.map((wall, i) => {
                const isDoor = DOORS.some(d => d.wall === i)
                if (isDoor) {
                  const door = DOORS.find(d => d.wall === i)!
                  // Split wall into two segments around door
                  const xDiff = wall.x2 - wall.x1
                  const yDiff = wall.y2 - wall.y1
                  const len = Math.sqrt(xDiff * xDiff + yDiff * yDiff)
                  const doorStart = door.start / len
                  const doorEnd = door.end / len
                  
                  return (
                    <g key={`wall-${i}`}>
                      <line 
                        x1={wall.x1} y1={wall.y1} 
                        x2={wall.x1 + xDiff * doorStart} 
                        y2={wall.y1 + yDiff * doorStart} 
                      />
                      <line 
                        x1={wall.x1 + xDiff * doorEnd} 
                        y1={wall.y1 + yDiff * doorEnd} 
                        x2={wall.x2} y2={wall.y2} 
                      />
                    </g>
                  )
                }
                return (
                  <line 
                    key={`wall-${i}`}
                    x1={wall.x1} y1={wall.y1} 
                    x2={wall.x2} y2={wall.y2} 
                  />
                )
              })}
            </g>
            
            {/* Door markers */}
            {DOORS.map((door, i) => {
              const wall = WALLS[door.wall]
              const xDiff = wall.x2 - wall.x1
              const yDiff = wall.y2 - wall.y1
              const len = Math.sqrt(xDiff * xDiff + yDiff * yDiff)
              const doorCenter = (door.start + door.end) / 2 / len
              const px = wall.x1 + xDiff * doorCenter
              const py = wall.y1 + yDiff * doorCenter
              
              return (
                <g key={`door-${i}`}>
                  <circle cx={px} cy={py} r="0.15" fill="var(--color-phosphor-soft)" stroke="var(--color-phosphor)" strokeWidth="0.03" />
                  <text x={px} y={py - 0.3} fontSize="0.2" fill="var(--color-phosphor-dim)" textAnchor="middle" fontFamily="sans-serif">
                    Door
                  </text>
                </g>
              )
            })}
            
            {/* Room labels */}
            <text x={1} y={0.5} fontSize="0.35" fill="var(--color-faint)" fontFamily="sans-serif" fontWeight="500">
              Lab Area
            </text>
            <text x={7} y={1.5} fontSize="0.3" fill="var(--color-faint)" fontFamily="sans-serif">
              Workstations
            </text>
            <text x={9.5} y={5} fontSize="0.3" fill="var(--color-faint)" fontFamily="sans-serif" textAnchor="end">
              Server Rack
            </text>
            
            {/* Coordinate markers */}
            {[0, 2, 4, 6, 8, 10, 12].map(x => (
              <text key={`x-${x}`} x={x} y={-0.2} fontSize="0.18" fill="var(--color-faint)" textAnchor="middle" fontFamily="monospace">
                {x}m
              </text>
            ))}
            {[0, 2, 4, 6, 8].map(y => (
              <text key={`y-${y}`} x={-0.3} y={y} fontSize="0.18" fill="var(--color-faint)" textAnchor="end" dominantBaseline="middle" fontFamily="monospace">
                {y}m
              </text>
            ))}
          </svg>

          {/* RSSI Signal Rings for Node A */}
          {[3, 6, 9].map(dist => (
            <div
              key={`ringA-${dist}`}
              className="absolute rounded-full border border-dashed"
              style={{
                left: `${metersToPercent(NODE_A_POS.x, NODE_A_POS.y).x}%`,
                top: `${metersToPercent(NODE_A_POS.x, NODE_A_POS.y).y}%`,
                width: `${(dist / ROOM_WIDTH) * 100}%`,
                height: `${(dist / ROOM_HEIGHT) * 100}%`,
                transform: 'translate(-50%, -50%)',
                borderColor: 'color-mix(in srgb, var(--color-phosphor) 25%, transparent)',
                opacity: 0.4,
              }}
            >
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-[color:var(--color-phosphor-dim)] font-mono">
                ~{dist}m
              </span>
            </div>
          ))}

          {/* RSSI Signal Rings for Node B */}
          {[3, 6, 9].map(dist => (
            <div
              key={`ringB-${dist}`}
              className="absolute rounded-full border border-dashed"
              style={{
                left: `${metersToPercent(NODE_B_POS.x, NODE_B_POS.y).x}%`,
                top: `${metersToPercent(NODE_B_POS.x, NODE_B_POS.y).y}%`,
                width: `${(dist / ROOM_WIDTH) * 100}%`,
                height: `${(dist / ROOM_HEIGHT) * 100}%`,
                transform: 'translate(-50%, -50%)',
                borderColor: 'color-mix(in srgb, var(--color-suspicious) 25%, transparent)',
                opacity: 0.3,
              }}
            />)
          )}

          {/* Threat Zones - Heatmap Circles */}
          {threatZones.map(zone => {
            const radius = Math.max(8, Math.min(28, zone.confidence * 35))
            const intensity = zone.confidence * 0.5 + 0.15
            
            return (
              <div
                key={zone.bssid}
                className="absolute rounded-full transition-all duration-500 cursor-pointer"
                style={{
                  left: `${zone.x}%`,
                  top: `${zone.y}%`,
                  width: `${radius}%`,
                  height: `${radius}%`,
                  transform: 'translate(-50%, -50%)',
                  background: `radial-gradient(circle at center, color-mix(in srgb, ${zone.color} ${Math.round(intensity * 100)}%, transparent) 0%, color-mix(in srgb, ${zone.color} ${Math.round(intensity * 60)}%, transparent) 40%, transparent 80%)`,
                  filter: 'blur(1px)',
                  zIndex: selected === zone.bssid ? 20 : 10,
                }}
                onClick={() => onSelect(selected === zone.bssid ? null : zone.bssid)}
              >
                {/* Confidence ring */}
                <div
                  className="absolute inset-0 rounded-full border"
                  style={{
                    borderColor: `color-mix(in srgb, ${zone.color} ${Math.round(zone.confidence * 80)}%, transparent)`,
                    borderWidth: '1.5px',
                    opacity: selected === zone.bssid ? 1 : 0.5,
                    boxShadow: selected === zone.bssid 
                      ? `0 0 0 2px var(--color-surface), 0 0 12px ${zone.color}`
                      : 'none',
                  }}
                />
              </div>
            )
          })}

          {/* Threat Labels */}
          {threatZones.map(zone => (
            <div
              key={`label-${zone.bssid}`}
              className="absolute pointer-events-none"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                transform: 'translate(-50%, calc(-100% - 8px))',
                zIndex: 15,
              }}
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: zone.color }}
                />
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium shadow-sm text-white"
                  style={{ backgroundColor: zone.color }}
                >
                  {zone.ssid} ({zone.score})
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                  style={{ 
                    backgroundColor: zone.confidence > 0.7 ? 'var(--color-flagged)' : 'var(--color-suspicious)',
                    color: 'white'
                  }}
                >
                  {Math.round(zone.confidence * 100)}%
                </span>
              </div>
            </div>
          ))}

          {/* Node A Marker */}
          <NodeMarker 
            id="A" 
            x={NODE_A_POS.x} 
            y={NODE_A_POS.y}
            color="var(--color-phosphor)"
            label="Node A"
            type="hopper"
            isSelected={selected === 'node-A'}
            onClick={() => onSelect('node-A')}
          />
          
          {/* Node B Marker */}
          <NodeMarker 
            id="B" 
            x={NODE_B_POS.x} 
            y={NODE_B_POS.y}
            color="var(--color-suspicious)"
            label="Node B"
            type="fixed"
            isSelected={selected === 'node-B'}
            onClick={() => onSelect('node-B')}
          />

          {/* Selected threat detail panel */}
          {selected && threatZones.find(z => z.bssid === selected) && (
            <ThreatDetailPanel zone={threatZones.find(z => z.bssid === selected)!} onClose={() => onSelect(null)} />
          )}

          {/* Selected node detail */}
          {selected === 'node-A' && (
            <NodeDetailPanel 
              node={{ 
                id: 'A', 
                pos: NODE_A_POS, 
                type: 'Channel Hopper (1-11)', 
                status: 'LIVE', 
                frames: nodes.find(n => n.id === 'A')?.framesTotal || 0, 
                fps: nodes.find(n => n.id === 'A')?.fps || 0,
                label: 'Node A'
              }}
              onClose={() => onSelect(null)}
            />
          )}
          {selected === 'node-B' && (
            <NodeDetailPanel 
              node={{ 
                id: 'B', 
                pos: NODE_B_POS, 
                type: 'Fixed Channel (6)', 
                status: 'LIVE', 
                frames: nodes.find(n => n.id === 'B')?.framesTotal || 0, 
                fps: nodes.find(n => n.id === 'B')?.fps || 0,
                label: 'Node B'
              }}
              onClose={() => onSelect(null)}
            />
          )}
        </div>
      </div>

      {/* Summary bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-[12px] text-[color:var(--color-dim)]">
          <div className="flex items-center gap-4">
            <span>{threats.length} threat zone{threats.length !== 1 ? 's' : ''}</span>
            <span className="px-2 py-0.5 rounded-full bg-[color:var(--color-phosphor-soft)] text-[color:var(--color-phosphor-dim)]">
              Live KNN + RSSI
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full orbit-pulse" style={{ backgroundColor: 'var(--color-phosphor)' }} />
              Node A: Ch-hopping
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full orbit-pulse" style={{ backgroundColor: 'var(--color-suspicious)' }} />
              Node B: Fixed Ch-6
            </span>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function NodeMarker({ 
  id, x, y, color, label, type, isSelected, onClick 
}: { 
  id: string; x: number; y: number; color: string; label: string; type: string; isSelected?: boolean; onClick?: () => void 
}) {
  const { x: px, y: py } = metersToPercent(x, y)
  
  return (
    <div
      className="absolute flex flex-col items-center cursor-pointer z-20"
      style={{ left: `${px}%`, top: `${py}%`, transform: 'translate(-50%, -50%)' }}
      onClick={onClick}
    >
      <div className="relative">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-[color:var(--color-surface)] text-[11px] font-bold shadow-lg transition-all ${isSelected ? 'scale-125' : ''}`}
          style={{ 
            borderColor: color, 
            color,
            boxShadow: isSelected 
              ? `0 0 0 3px var(--color-surface), 0 0 16px ${color}` 
              : `0 0 0 2px var(--color-surface), 0 4px 12px rgba(0,0,0,0.15)`
          }}
        >
          {id}
        </span>
        {isSelected && (
          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: color }}>
            ✓
          </div>
        )}
      </div>
      <div className="mt-1.5 flex flex-col items-center">
        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-sm text-white" style={{ backgroundColor: color }}>
          {label}
        </span>
        <span className="mt-0.5 text-[8px] text-[color:var(--color-faint)] whitespace-nowrap">{type}</span>
      </div>
    </div>
  )
}

function ThreatDetailPanel({ zone, onClose }: { zone: ThreatZone; onClose: () => void }) {
  // Position panel near threat but within viewport
  const panelLeft = Math.min(Math.max(zone.x, 15), 85)
  const panelTop = zone.y < 50 ? zone.y + 15 : zone.y - 15
  
  return (
    <div
      className="absolute pointer-events-auto orbit-slide-in z-30"
      style={{
        left: `${panelLeft}%`,
        top: zone.y < 50 ? `${panelTop}%` : 'auto',
        bottom: zone.y >= 50 ? `${100 - panelTop}%` : 'auto',
        transform: 'translateX(-50%)',
        maxWidth: 280,
      }}
    >
      <div className="orbit-card rounded-xl shadow-xl border p-0 overflow-hidden" style={{ borderColor: `color-mix(in srgb, ${zone.color} 50%, var(--color-line))` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: `color-mix(in srgb, ${zone.color} 12%, transparent)` }}>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
            <span className="font-semibold text-[13px] text-[color:var(--color-fg)]">{zone.ssid}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: zone.color }}>
              {zone.score}/100
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-[color:var(--color-dim)] hover:text-[color:var(--color-fg)] hover:bg-[color:var(--color-line)]">
            ✕
          </button>
        </div>
        
        <div className="p-4 space-y-3">
          {/* Confidence */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-[color:var(--color-dim)]">Triangulation Confidence</span>
              <span className="font-medium" style={{ color: zone.color }}>{Math.round(zone.confidence * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-[color:var(--color-line)] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ 
                width: `${zone.confidence * 100}%`, 
                backgroundColor: zone.color 
              }} />
            </div>
          </div>

          {/* RSSI from each node */}
          <div className="grid grid-cols-2 gap-3">
            <RSSIDetail label="Node A RSSI" value={zone.rssiA} color="var(--color-phosphor)" />
            <RSSIDetail label="Node B RSSI" value={zone.rssiB} color="var(--color-suspicious)" />
          </div>

          {/* Position estimate */}
          <div className="rounded-lg bg-[color:var(--color-elevated)] p-3">
            <div className="text-[11px] font-medium text-[color:var(--color-dim)] mb-2">Estimated Position</div>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <span className="text-[color:var(--color-faint)]">X</span>
              <span className="font-mono font-medium text-right text-[color:var(--color-fg)]">
                {((zone.x / 100) * ROOM_WIDTH).toFixed(1)} m
              </span>
              <span className="text-[color:var(--color-faint)]">Y</span>
              <span className="font-mono font-medium text-right text-[color:var(--color-fg)]">
                {((1 - zone.y / 100) * ROOM_HEIGHT).toFixed(1)} m
              </span>
            </div>
          </div>

          {/* Evidence tags */}
          <div>
            <div className="text-[11px] font-medium text-[color:var(--color-dim)] mb-2">Evidence Contributing</div>
            <div className="flex flex-wrap gap-1.5">
              {getEvidenceForScore(zone.score).map((e, i) => (
                <span key={i} className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ 
                  backgroundColor: `color-mix(in srgb, ${zone.color} 20%, transparent)`,
                  color: zone.color,
                }}>
                  {e} +{getPointsForEvidence(e)}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-[color:var(--color-line)] flex gap-2">
            <button className="flex-1 rounded-lg bg-[color:var(--color-phosphor)] py-2 text-[12px] font-medium text-white hover:brightness-105">
              Mark Resolved
            </button>
            <button className="flex-1 rounded-lg border border-[color:var(--color-line-bright)] py-2 text-[12px] font-medium text-[color:var(--color-dim)] hover:border-[color:var(--color-phosphor)] hover:text-[color:var(--color-phosphor)]">
              Whitelist
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RSSIDetail({ label, value, color }: { label: string; value: number; color: string }) {
  const quality = value > -50 ? 'Excellent' : value > -65 ? 'Good' : value > -75 ? 'Fair' : 'Weak'
  return (
    <div className="rounded-lg bg-[color:var(--color-elevated)] p-3">
      <div className="text-[11px] text-[color:var(--color-dim)]">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-[22px] font-bold font-mono" style={{ color }}>{value} dBm</span>
        <span className="text-[10px] text-[color:var(--color-faint)]">({quality})</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-[color:var(--color-line)] overflow-hidden">
        <div className="h-full rounded-full" style={{ 
          width: `${Math.max(0, Math.min(100, (value + 100) * 1.5))}%`,
          backgroundColor: color 
        }} />
      </div>
    </div>
  )
}

function NodeDetailPanel({ node, onClose }: { node: { id: string; pos: { x: number; y: number }; type: string; status: string; frames: number; fps: number; label: string }; onClose: () => void }) {
  const { x: px, y: py } = metersToPercent(node.pos.x, node.pos.y)
  
  return (
    <div
      className="absolute pointer-events-auto orbit-slide-in z-30"
      style={{
        left: `${Math.min(Math.max(px, 15), 85)}%`,
        top: `${py < 50 ? py + 15 : py - 15}%`,
        transform: 'translateX(-50%)',
        maxWidth: 260,
      }}
    >
      <div className="orbit-card rounded-xl shadow-xl border p-0 overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--color-phosphor) 50%, var(--color-line))' }}>
        <div className="flex items-center justify-between px-4 py-3 bg-[color:var(--color-phosphor-soft)]">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 bg-[color:var(--color-surface)] text-[12px] font-bold text-[color:var(--color-phosphor)]" style={{ borderColor: 'var(--color-phosphor)' }}>
              {node.id}
            </span>
            <span className="font-semibold text-[13px]">{node.label}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-[color:var(--color-dim)] hover:text-[color:var(--color-fg)] hover:bg-[color:var(--color-line)]">✕</button>
        </div>
        
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full orbit-pulse" style={{ backgroundColor: 'var(--color-phosphor)' }} />
            <span className="text-[12px] font-medium text-[color:var(--color-phosphor)]">{node.status}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="Type" value={node.type} />
            <StatBox label="Frames" value={node.frames.toLocaleString()} />
            <StatBox label="FPS" value={node.fps.toFixed(1)} />
            <StatBox label="Position" value={`${node.pos.x}m, ${node.pos.y}m`} />
          </div>
          
          <div className="rounded-lg bg-[color:var(--color-elevated)] p-3 text-[11px] text-[color:var(--color-dim)]">
            Channel hopper sweeping 2.4GHz band (1-11). Dwell time 300ms/channel. Captures beacons, probe responses, deauth frames.
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[color:var(--color-elevated)] p-3">
      <div className="text-[10px] text-[color:var(--color-dim)]">{label}</div>
      <div className="text-[13px] font-mono font-medium text-[color:var(--color-fg)]">{value}</div>
    </div>
  )
}

function getEvidenceForScore(score: number): string[] {
  const evidence = []
  if (score >= 30) evidence.push('SSID Collision')
  if (score >= 25) evidence.push('Security Downgrade')
  if (score >= 15) evidence.push('Channel Mismatch')
  if (score >= 15 && score < 30) evidence.push('RSSI Anomaly')
  if (score >= 30) evidence.push('Karma Multi-SSID')
  if (score >= 25) evidence.push('Deauth Burst')
  if (score >= 30) evidence.push('EAPOL Capture')
  return evidence.length ? evidence : ['Unknown']
}

function getPointsForEvidence(e: string): number {
  const map: Record<string, number> = {
    'SSID Collision': 30,
    'Security Downgrade': 25,
    'Channel Mismatch': 15,
    'RSSI Anomaly': 15,
    'Karma Multi-SSID': 30,
    'Deauth Burst': 25,
    'EAPOL Capture': 30,
  }
  return map[e] || 0
}