import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Alert } from '../lib/api';

// Map backend alert to frontend format
function mapBackendAlert(a: any): Alert {
  const timestamp = a.timestamp ? new Date(a.timestamp * 1000).toLocaleTimeString() : '—';
  return {
    id: String(a.id),
    bssid: a.bssid || a.device_mac,
    ssid: a.ssid || '—',
    vendor: a.vendor || 'unknown',
    severity: a.severity || (a.score >= 70 ? 'FLAGGED' : a.score >= 40 ? 'SUSPICIOUS' : 'WATCHING'),
    confidence: a.score || a.confidence || 0,
    timestamp,
    evidence: (a.evidence || []).map((e: any) => ({
      rule: e.rule || e.label,
      points: e.points || e.score || 0,
      detail: e.detail || '',
    })),
    narration: a.narration || a.aiNarration || '',
    resolved: !!a.resolved,
    whitelisted: !!a.whitelisted,
  };
}

const severityConfig = {
  FLAGGED: { color: 'text-status-flagged bg-status-flagged-bg border-status-flagged/20', dot: '#EF4444' },
  SUSPICIOUS: { color: 'text-status-suspicious bg-status-suspicious-bg border-status-suspicious/20', dot: '#F59E0B' },
  WATCHING: { color: 'text-status-watching bg-status-watching-bg border-status-watching/20', dot: '#EAB308' },
};

function AlertCard({ alert, onResolve, onWhitelist, isResolving, isWhitelisting }: { 
  alert: Alert; 
  onResolve: (id: string) => void; 
  onWhitelist: (id: string) => void;
  isResolving: boolean;
  isWhitelisting: boolean;
}) {
  const [expanded, setExpanded] = useState(!alert.resolved);
  const cfg = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.SUSPICIOUS;

  return (
    <div
      className={`bg-card rounded-2xl border card-shadow transition-all duration-300 overflow-hidden animate-slide-in-up ${
        alert.resolved ? 'opacity-50 border-border/40' : 'border-border/60'
      }`}
      style={{ borderLeftWidth: '3px', borderLeftColor: cfg.dot }}
    >
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${cfg.color}`}>
                {alert.severity}
              </span>
              {alert.resolved && (
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border text-status-live bg-status-live-bg border-status-live/20">
                  RESOLVED
                </span>
              )}
              <span className="text-xs text-muted-foreground">{alert.timestamp}</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground mt-1.5">{alert.ssid}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono text-muted-foreground">{alert.bssid}</span>
              <button
                onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(alert.bssid); }}
                className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <span className="text-xs text-muted-foreground">· {alert.vendor}</span>
            </div>
          </div>

          {/* Confidence score */}
          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            <div className="text-xs text-muted-foreground">Confidence</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: cfg.dot }}>
              {alert.confidence}<span className="text-xs font-normal text-muted-foreground">/100</span>
            </div>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${alert.confidence}%`, background: cfg.dot }} />
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/60 pt-4">
          {/* Evidence */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Evidence</h4>
            {alert.evidence.map((e: { rule?: string; label?: string; points?: number; score?: number }, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{e.rule || e.label}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${((e.points || 0) / 30) * 100}%`, background: cfg.dot }} />
                  </div>
                  <span className="font-bold font-mono w-8 text-right" style={{ color: cfg.dot }}>+{e.points || 0}</span>
                </div>
              </div>
            ))}
          </div>

          {/* AI narration */}
          <div className="bg-secondary/50 border border-primary/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg className="w-3 h-3 text-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
              <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">AI Analysis</span>
            </div>
            <p className="text-xs text-foreground leading-relaxed">"{alert.narration}"</p>
          </div>

          {/* Actions */}
          {!alert.resolved && !alert.whitelisted && (
            <div className="flex gap-2">
              <button
                onClick={() => onResolve(alert.id)}
                disabled={isResolving}
                className="flex-1 bg-primary text-primary-foreground text-xs font-semibold rounded-xl py-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {isResolving ? 'Resolving...' : 'Mark Resolved'}
              </button>
              <button
                onClick={() => onWhitelist(alert.id)}
                disabled={isWhitelisting}
                className="flex-1 border border-border text-foreground text-xs font-semibold rounded-xl py-2 hover:bg-muted transition-colors disabled:opacity-60"
              >
                {isWhitelisting ? 'Adding...' : 'Add to Whitelist'}
              </button>
            </div>
          )}
          {alert.resolved && (
            <div className="text-center text-xs text-status-live font-medium">
              Resolved
            </div>
          )}
          {alert.whitelisted && !alert.resolved && (
            <div className="text-center text-xs text-status-watching font-medium">
              Whitelisted
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Alerts({ selectedDevice }: { selectedDevice: string | null }) {
  const [alertList, setAlertList] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [whitelistingId, setWhitelistingId] = useState<string | null>(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAlerts();
      setAlertList(data.map(mapBackendAlert));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const filters = ['All', 'Flagged', 'Suspicious', 'Watching', 'Resolved'];

  const filtered = alertList.filter(a => {
    if (selectedDevice) {
      // Filter by device if selected
      return a.bssid === selectedDevice || a.ssid.includes(selectedDevice);
    }
    if (filter === 'All') return !a.resolved;
    if (filter === 'Resolved') return a.resolved;
    return a.severity === filter.toUpperCase() && !a.resolved;
  });

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      await api.resolveAlert(id);
      setAlertList(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    } catch (e) {
      console.error('Resolve failed:', e);
      window.alert('Failed to resolve alert: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setResolvingId(null);
    }
  };

  const handleWhitelist = async (id: string) => {
    setWhitelistingId(id);
    const alert = alertList.find(a => a.id === id);
    if (!alert) return;
    
    try {
      await api.whitelistAlert(alert.ssid, alert.bssid);
      setAlertList(prev => prev.map(a => a.id === id ? { ...a, whitelisted: true } : a));
    } catch (e) {
      console.error('Whitelist failed:', e);
      window.alert('Failed to whitelist: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setWhitelistingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading alerts...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="bg-status-flagged-bg border border-status-flagged/20 rounded-2xl p-4 text-status-flagged">
          <div className="font-semibold">Error loading alerts</div>
          <div className="text-sm mt-1">{error}</div>
          <button 
            onClick={fetchAlerts}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Alerts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {alertList.filter(a => !a.resolved).length} active · {alertList.filter(a => a.resolved).length} resolved
            {selectedDevice && <span className="ml-2 text-primary">· Filtered by device</span>}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-150 ${
              filter === f
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-foreground font-semibold">No active alerts</div>
          <div className="text-muted-foreground text-sm">No threats detected right now. All systems operational.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onResolve={handleResolve}
              onWhitelist={handleWhitelist}
              isResolving={resolvingId === alert.id}
              isWhitelisting={whitelistingId === alert.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}