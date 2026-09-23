import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { timelineEvents as defaultEvents, type TimelineEvent } from '../data/mockData';

const severityConfig: Record<string, { color: string; bg: string; border: string; dot: string; label: string }> = {
  FLAGGED: { color: 'text-status-flagged', bg: 'bg-status-flagged-bg', border: 'border-status-flagged/30', dot: '#EF4444', label: 'Flagged Attack' },
  SUSPICIOUS: { color: 'text-status-suspicious', bg: 'bg-status-suspicious-bg', border: 'border-status-suspicious/30', dot: '#F59E0B', label: 'Suspicious Anomaly' },
  WATCHING: { color: 'text-status-watching', bg: 'bg-status-watching-bg', border: 'border-status-watching/30', dot: '#EAB308', label: 'Watching Proximity' },
  UNKNOWN: { color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', dot: '#94A3B8', label: 'Baseline & Station' },
};

function formatEvent(raw: any, index: number): TimelineEvent {
  const normMac = String(raw.device_mac || raw.bssid || raw.deviceId || `DEV-${index}`).toUpperCase().replace(/[:-]/g, '');
  const formattedMac = normMac.length === 12 ? normMac.match(/.{1,2}/g)?.join(':') || normMac : normMac;
  
  let sev: TimelineEvent['severity'] = 'UNKNOWN';
  const score = raw.score || 0;
  if (score >= 70 || raw.event_type?.includes('collision') || raw.event_type?.includes('handshake') || raw.severity === 'FLAGGED') {
    sev = 'FLAGGED';
  } else if (score >= 25 || raw.event_type?.includes('karma') || raw.event_type?.includes('deauth') || raw.severity === 'SUSPICIOUS') {
    sev = 'SUSPICIOUS';
  } else if (score >= 15 || raw.event_type?.includes('ble') || raw.event_type?.includes('mismatch') || raw.severity === 'WATCHING') {
    sev = 'WATCHING';
  }

  let ssid = raw.ssid;
  if (!ssid) {
    if (normMac.startsWith('AABBCC001199')) ssid = 'HomeNet-5G [Rogue Clone]';
    else if (normMac.startsWith('AABBCC001122')) ssid = 'HomeNet-5G [Base AP]';
    else if (normMac.startsWith('EEFF00112233')) ssid = 'KarmaNet';
    else if (normMac.startsWith('EE1122334455')) ssid = 'BLE Tracking Beacon';
    else if (normMac.startsWith('123456789ABC')) ssid = 'Client Station';
    else if (normMac.startsWith('50C7BF112233')) ssid = 'AndroidAP';
    else ssid = 'Airspace Entity';
  }

  const timeStr = raw.timestamp
    ? (typeof raw.timestamp === 'number' ? new Date(raw.timestamp * 1000).toLocaleTimeString() : String(raw.timestamp))
    : '00:24:50';

  let eventType = raw.type || raw.event_type || 'RF Observation';
  eventType = eventType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

  return {
    id: String(raw.id || `ev-${index}`),
    deviceId: normMac,
    ssid,
    bssid: formattedMac,
    timestamp: timeStr,
    type: eventType,
    severity: sev,
    score: score,
    description: raw.description || raw.detail || `Observed ${eventType} on ${ssid} matching intrusion signature heuristics.`,
  };
}

export default function Timeline({ selectedDevice }: { selectedDevice?: string | null }) {
  const [events, setEvents] = useState<TimelineEvent[]>(defaultEvents);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [filterDevice, setFilterDevice] = useState<string | null>(selectedDevice || null);
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'STREAM' | 'LEDGER'>('STREAM');
  const [isExpandedFull, setIsExpandedFull] = useState(false);

  useEffect(() => {
    if (selectedDevice) {
      setFilterDevice(selectedDevice);
    }
  }, [selectedDevice]);

  const loadObservations = async () => {
    try {
      const data = await api.getObservations();
      if (Array.isArray(data) && data.length > 0) {
        const mapped = data.map(formatEvent);
        setEvents(mapped);
      } else {
        setEvents(defaultEvents.map(formatEvent));
      }
    } catch {
      setEvents(defaultEvents.map(formatEvent));
    }
  };

  useEffect(() => {
    loadObservations();
  }, []);

  // Filtered dataset
  const filtered = useMemo(() => {
    return events.filter(e => {
      // Device filter
      if (filterDevice) {
        const normKey = filterDevice.replace(/[:-]/g, '').toUpperCase();
        const matchesMac = e.bssid.replace(/[:-]/g, '').toUpperCase() === normKey || e.deviceId.replace(/[:-]/g, '').toUpperCase() === normKey;
        const matchesSsid = e.ssid.toLowerCase().includes(filterDevice.toLowerCase());
        if (!matchesMac && !matchesSsid) return false;
      }

      // Severity filter
      if (severityFilter !== 'ALL' && e.severity !== severityFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText = e.type.toLowerCase().includes(q) ||
          e.ssid.toLowerCase().includes(q) ||
          e.bssid.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q);
        if (!matchesText) return false;
      }

      return true;
    });
  }, [events, filterDevice, severityFilter, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [filtered]);

  // Unique devices in history
  const uniqueDevices = useMemo(() => {
    const map = new Map<string, { bssid: string; ssid: string; count: number }>();
    for (const e of events) {
      const key = e.deviceId;
      if (!map.has(key)) {
        map.set(key, { bssid: e.bssid, ssid: e.ssid, count: 0 });
      }
      map.get(key)!.count += 1;
    }
    return Array.from(map.entries()).map(([key, v]) => ({ id: key, ...v }));
  }, [events]);

  const flaggedCount = events.filter(e => e.severity === 'FLAGGED').length;
  const suspiciousCount = events.filter(e => e.severity === 'SUSPICIOUS').length;
  const watchingCount = events.filter(e => e.severity === 'WATCHING').length;

  return (
    <div className={`p-6 space-y-6 animate-fade-in ${isExpandedFull ? 'max-w-none' : ''}`}>
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-foreground">Threat Timeline & Audit History</h1>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {events.length} Historical Records
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chronological RF telemetry, deauth bursts, and cryptographic intrusion events
          </p>
        </div>

        {/* View Switchers & Expansion Toggles */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="bg-card border border-border/80 rounded-xl p-0.5 flex items-center shadow-sm">
            <button
              onClick={() => setViewMode('STREAM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'STREAM'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ◉ Timeline Stream
            </button>
            <button
              onClick={() => setViewMode('LEDGER')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'LEDGER'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ☰ Audit Ledger
            </button>
          </div>

          <button
            onClick={() => setIsExpandedFull(!isExpandedFull)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors shadow-sm"
          >
            {isExpandedFull ? '↙ Compact View' : '⛶ Expand Full Screen'}
          </button>
        </div>
      </div>

      {/* Metric Counters Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-card rounded-2xl border border-border/60 p-4 card-shadow">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Logged Events</span>
          <div className="text-2xl font-bold text-foreground tabular-nums mt-1">{events.length}</div>
        </div>
        <div className="bg-card rounded-2xl border border-status-flagged/30 bg-status-flagged-bg/30 p-4 card-shadow">
          <span className="text-[10px] font-bold uppercase tracking-wider text-status-flagged">Critical Attacks</span>
          <div className="text-2xl font-bold text-status-flagged tabular-nums mt-1">{flaggedCount}</div>
        </div>
        <div className="bg-card rounded-2xl border border-status-suspicious/30 bg-status-suspicious-bg/30 p-4 card-shadow">
          <span className="text-[10px] font-bold uppercase tracking-wider text-status-suspicious">Anomalies</span>
          <div className="text-2xl font-bold text-status-suspicious tabular-nums mt-1">{suspiciousCount}</div>
        </div>
        <div className="bg-card rounded-2xl border border-status-watching/30 bg-status-watching-bg/30 p-4 card-shadow">
          <span className="text-[10px] font-bold uppercase tracking-wider text-status-watching">Proximity Signals</span>
          <div className="text-2xl font-bold text-status-watching tabular-nums mt-1">{watchingCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card rounded-2xl border border-border/70 p-4 card-shadow space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events by attack rule, SSID, BSSID, or keywords…"
              className="w-full pl-9 pr-4 py-2 text-xs bg-muted/40 border border-border/70 rounded-xl outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Severity Filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {['ALL', 'FLAGGED', 'SUSPICIOUS', 'WATCHING', 'UNKNOWN'].map(sev => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                  severityFilter === sev
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-muted/30 border-border/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* Device Quick Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 text-xs">
          <span className="text-muted-foreground text-[11px] font-semibold flex-shrink-0">Target Entity:</span>
          <button
            onClick={() => setFilterDevice(null)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all flex-shrink-0 ${
              !filterDevice
                ? 'bg-foreground text-background border-foreground font-bold'
                : 'bg-muted/20 border-border/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            All Entities ({events.length})
          </button>
          {uniqueDevices.map(d => (
            <button
              key={d.id}
              onClick={() => setFilterDevice(filterDevice === d.id ? null : d.id)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all flex-shrink-0 flex items-center gap-1.5 ${
                filterDevice === d.id
                  ? 'bg-primary text-primary-foreground border-primary font-bold shadow-sm'
                  : 'bg-muted/20 border-border/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{d.ssid}</span>
              <span className="opacity-70 font-mono text-[10px]">({d.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* View Mode: Timeline Stream (Connected Vertical Spine) */}
      {viewMode === 'STREAM' && (
        <div className="space-y-4">
          <div className="bg-card rounded-3xl border border-border/60 card-shadow-md p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Chronological Attack Escalation Feed
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                Showing {sorted.length} events
              </span>
            </div>

            {sorted.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No matching events found for the active filter.
              </div>
            ) : (
              <div className="relative pl-6 sm:pl-8 space-y-4">
                {/* Continuous Vertical Spine */}
                <div className="absolute top-3 bottom-3 left-2.5 sm:left-3.5 w-0.5 bg-gradient-to-b from-primary via-border to-transparent" />

                {sorted.map((event) => {
                  const cfg = severityConfig[event.severity] || severityConfig.UNKNOWN;
                  const isSelected = selectedEvent?.id === event.id;

                  return (
                    <div key={event.id} className="relative group">
                      {/* Node Bullet on Spine */}
                      <div
                        className="absolute -left-[23px] sm:-left-[27px] top-4 w-3.5 h-3.5 rounded-full border-2 border-card z-10 transition-transform group-hover:scale-125"
                        style={{ background: cfg.dot }}
                      >
                        {event.severity === 'FLAGGED' && (
                          <div className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: '#EF4444' }} />
                        )}
                      </div>

                      {/* Event Card */}
                      <div
                        onClick={() => setSelectedEvent(isSelected ? null : event)}
                        className={`bg-muted/15 border rounded-2xl p-4.5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:card-shadow-md ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30 card-shadow-md'
                            : 'border-border/60 hover:border-border'
                        }`}
                        style={{
                          borderLeftWidth: '3.5px',
                          borderLeftColor: cfg.dot,
                        }}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                              {event.severity}
                            </span>
                            <h3 className="text-sm font-bold text-foreground">{event.type}</h3>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground flex-shrink-0">
                            <span className="font-semibold text-foreground">{event.timestamp}</span>
                            <span>·</span>
                            <span>Score: <strong style={{ color: cfg.dot }}>+{event.score}</strong></span>
                          </div>
                        </div>

                        <p className="text-xs text-foreground/85 leading-relaxed pt-1">
                          {event.description}
                        </p>

                        <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground pt-3 border-t border-border/40 mt-3 flex-wrap">
                          <div>Target SSID: <strong className="text-foreground">{event.ssid}</strong></div>
                          <div>Hardware BSSID: <strong className="text-foreground">{event.bssid}</strong></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Mode: Extended Historical Ledger */}
      {viewMode === 'LEDGER' && (
        <div className="bg-card rounded-3xl border border-border/70 card-shadow-md overflow-hidden space-y-0">
          <div className="p-5 border-b border-border/60 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Extended Cryptographic Audit Ledger</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Chronological packet breakdown with evidence point distributions</p>
            </div>
            <span className="text-xs font-mono font-bold text-foreground bg-muted px-2.5 py-1 rounded-lg">
              {sorted.length} Entries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Intrusion Signal / Rule</th>
                  <th className="py-3 px-4">Target Network (SSID)</th>
                  <th className="py-3 px-4">Hardware ID (BSSID)</th>
                  <th className="py-3 px-4 text-right">Score</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sorted.map(ev => {
                  const cfg = severityConfig[ev.severity] || severityConfig.UNKNOWN;
                  const isSelected = selectedEvent?.id === ev.id;

                  return (
                    <tr
                      key={ev.id}
                      onClick={() => setSelectedEvent(isSelected ? null : ev)}
                      className={`hover:bg-muted/30 cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10 font-medium' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-mono text-muted-foreground whitespace-nowrap">{ev.timestamp}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                          {ev.severity}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-foreground max-w-xs truncate" title={ev.type}>
                        {ev.type}
                      </td>
                      <td className="py-3.5 px-4 text-foreground whitespace-nowrap">{ev.ssid}</td>
                      <td className="py-3.5 px-4 font-mono text-muted-foreground whitespace-nowrap">{ev.bssid}</td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {ev.score > 0 ? (
                          <span className="font-mono font-bold" style={{ color: cfg.dot }}>+{ev.score}</span>
                        ) : (
                          <span className="text-muted-foreground font-mono">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                          className="text-primary hover:underline font-semibold"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected Event Detail Inspector Drawer / Modal */}
      {selectedEvent && (
        <div className="bg-card rounded-3xl border-2 border-primary/30 card-shadow-lg p-6 animate-slide-in-up space-y-4">
          <div className="flex items-start justify-between border-b border-border/60 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-full border ${
                    severityConfig[selectedEvent.severity]?.color || ''
                  } ${severityConfig[selectedEvent.severity]?.bg || ''} ${severityConfig[selectedEvent.severity]?.border || ''}`}
                >
                  {selectedEvent.severity}
                </span>
                <span className="text-xs font-mono text-muted-foreground">ID: {selectedEvent.id}</span>
              </div>
              <h3 className="text-lg font-bold text-foreground mt-1">{selectedEvent.type}</h3>
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="bg-muted/30 border border-border/60 rounded-2xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-1.5">Intrusion Evidence Breakdown</h4>
            <p className="text-sm text-foreground leading-relaxed">{selectedEvent.description}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-1">
            <div className="bg-card border border-border/60 rounded-xl p-3">
              <div className="text-muted-foreground text-[10px] uppercase font-bold">Target SSID</div>
              <div className="font-semibold text-foreground text-sm mt-0.5 truncate">{selectedEvent.ssid}</div>
            </div>
            <div className="bg-card border border-border/60 rounded-xl p-3">
              <div className="text-muted-foreground text-[10px] uppercase font-bold">Transmitter BSSID</div>
              <div className="font-mono font-semibold text-foreground text-sm mt-0.5">{selectedEvent.bssid}</div>
            </div>
            <div className="bg-card border border-border/60 rounded-xl p-3">
              <div className="text-muted-foreground text-[10px] uppercase font-bold">Observation Time</div>
              <div className="font-mono font-semibold text-foreground text-sm mt-0.5">{selectedEvent.timestamp}</div>
            </div>
            <div className="bg-card border border-border/60 rounded-xl p-3">
              <div className="text-muted-foreground text-[10px] uppercase font-bold">Evidence Weight</div>
              <div className="font-mono font-bold text-lg text-primary mt-0.5">+{selectedEvent.score} PTS</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
