import { useState } from 'react';
import { timelineEvents, type TimelineEvent } from '../data/mockData';

const severityOrder = ['UNKNOWN', 'WATCHING', 'SUSPICIOUS', 'FLAGGED'];

const severityConfig: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  FLAGGED: { color: 'text-status-flagged', bg: 'bg-status-flagged-bg', border: 'border-status-flagged/30', dot: '#EF4444' },
  SUSPICIOUS: { color: 'text-status-suspicious', bg: 'bg-status-suspicious-bg', border: 'border-status-suspicious/30', dot: '#F59E0B' },
  WATCHING: { color: 'text-status-watching', bg: 'bg-status-watching-bg', border: 'border-status-watching/30', dot: '#EAB308' },
  UNKNOWN: { color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', dot: '#9CA3AF' },
};

function EventCard({ event, selected, onClick }: { event: TimelineEvent; selected: boolean; onClick: () => void }) {
  const cfg = severityConfig[event.severity] || severityConfig.UNKNOWN;

  return (
    <div
      className={`flex-shrink-0 w-56 bg-card rounded-2xl border p-4 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:card-shadow-md animate-slide-in-up ${
        selected ? `border-[${cfg.dot}]/50 ring-1 ring-[${cfg.dot}]/30 card-shadow-md` : 'border-border/60 card-shadow'
      }`}
      style={{
        borderColor: selected ? cfg.dot + '60' : undefined,
        boxShadow: selected ? `0 4px 16px ${cfg.dot}18` : undefined,
      }}
      onClick={onClick}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span
            className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}
          >
            {event.severity}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">{event.timestamp}</span>
        </div>
        <div className="text-sm font-semibold text-foreground">{event.type}</div>
        <div className="text-xs text-muted-foreground truncate">{event.ssid}</div>
        {event.score > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${event.score}%`, background: cfg.dot }} />
            </div>
            <span className="text-[10px] font-bold font-mono" style={{ color: cfg.dot }}>
              {event.score}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Timeline({ selectedDevice }: { selectedDevice: string | null }) {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [filterDevice, setFilterDevice] = useState<string | null>(selectedDevice);

  const filtered = filterDevice
    ? timelineEvents.filter(e => e.deviceId === filterDevice)
    : timelineEvents;

  const sorted = [...filtered].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Threat Timeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Chronological intelligence event stream</p>
        </div>
        <button
          onClick={() => setFilterDevice(null)}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
            !filterDevice ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/40'
          }`}
        >
          All Devices
        </button>
      </div>

      {/* Severity ladder */}
      <div className="bg-card rounded-2xl border border-border/60 card-shadow p-4 flex items-center gap-4 text-xs text-muted-foreground overflow-x-auto">
        {severityOrder.map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-shrink-0">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: severityConfig[s].dot }}
            />
            <span className="font-medium">{s.charAt(0) + s.slice(1).toLowerCase()}</span>
            {i < severityOrder.length - 1 && (
              <svg className="w-3 h-3 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
        ))}
        <div className="ml-auto text-muted-foreground/50 flex-shrink-0">Escalation path</div>
      </div>

      {/* Horizontal timeline */}
      <div className="relative overflow-x-auto pb-4">
        {/* Connecting line */}
        <div className="absolute top-[60px] left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        <div className="flex gap-4 min-w-max px-4">
          {sorted.map((event, i) => (
            <div key={event.id} className="relative flex flex-col items-center gap-3">
              {/* Timeline dot */}
              <div className="relative z-10 mt-[48px]">
                <div
                  className="w-3 h-3 rounded-full border-2 border-card"
                  style={{ background: severityConfig[event.severity]?.dot || '#9CA3AF' }}
                >
                  {event.severity === 'FLAGGED' && (
                    <div
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{ background: '#EF4444', opacity: 0.4 }}
                    />
                  )}
                </div>
              </div>

              {/* Event card — alternate above/below */}
              <div className={i % 2 === 0 ? '-order-1' : 'order-2'}>
                <EventCard
                  event={event}
                  selected={selectedEvent?.id === event.id}
                  onClick={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
                />
              </div>

              {/* Spacer for alternating cards */}
              {i % 2 !== 0 && <div className="-order-1 w-56 h-24" />}
              {i % 2 === 0 && <div className="order-2 w-56 h-24" />}
            </div>
          ))}
        </div>
      </div>

      {/* Selected event detail */}
      {selectedEvent && (
        <div className="bg-card rounded-2xl border border-border/60 card-shadow-md p-5 animate-slide-in-up space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span
                className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${severityConfig[selectedEvent.severity]?.color || ''} ${severityConfig[selectedEvent.severity]?.bg || ''} ${severityConfig[selectedEvent.severity]?.border || ''}`}
              >
                {selectedEvent.severity}
              </span>
              <h3 className="text-base font-bold text-foreground">{selectedEvent.type}</h3>
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{selectedEvent.description}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground">SSID</div>
              <div className="font-medium text-foreground">{selectedEvent.ssid}</div>
            </div>
            <div>
              <div className="text-muted-foreground">BSSID</div>
              <div className="font-mono font-medium text-foreground">{selectedEvent.bssid}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Timestamp</div>
              <div className="font-mono font-medium text-foreground">{selectedEvent.timestamp}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Score</div>
              <div className="font-bold font-mono text-foreground">{selectedEvent.score}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
