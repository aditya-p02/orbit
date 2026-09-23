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

interface ThreatExplanation {
  attackName: string;
  simpleExplanation: string;
  attackerGoal: string;
}

function getDetailedThreatExplanation(narration: string, ssid: string, evidence: any[]): ThreatExplanation {
  const norm = (narration || '').toLowerCase();
  const rules = (evidence || []).map((e: any) => (e.rule || e.label || '').toLowerCase()).join(' ');

  // 1. Evil Twin Attack
  if (norm.includes('evil twin') || rules.includes('ssid_collision') || (rules.includes('ssid') && rules.includes('downgrade'))) {
    return {
      attackName: "Rogue Access Point Impersonation (Evil Twin Attack)",
      simpleExplanation: `An unauthorized transmitter is broadcasting '${ssid}', which matches a network configured in the system's trusted whitelist, but with security disabled (open/unencrypted). If client devices connect to this rogue signal instead of the verified access point, all browsing traffic and credentials can be intercepted.`,
      attackerGoal: "Bait client stations into connecting to an unencrypted lookalike access point to intercept network traffic.",
    };
  }

  // 2. Handshake Sniffing / Deauth
  if (norm.includes('handshake') || rules.includes('handshake') || rules.includes('deauth') || rules.includes('eapol')) {
    return {
      attackName: "WPA Handshake Interception Attempt (Deauthentication Attack)",
      simpleExplanation: `An attacker transmitted spoofed deauthentication frames to disconnect a client station from '${ssid}'. When the client automatically reconnected, the attacker captured the 4-way WPA security handshake to attempt offline password cracking.`,
      attackerGoal: "Obtain encrypted WPA handshake tokens to attempt offline password cracking without access to the router.",
    };
  }

  // 3. Karma / PineApple Probe Trap
  if (norm.includes('karma') || rules.includes('karma') || rules.includes('probe')) {
    return {
      attackName: "Automated Probe Response Trap (Karma Attack)",
      simpleExplanation: `This rogue access point is answering client probe requests for multiple different network names, masquerading as whatever SSID a nearby device is searching for. It tricks devices with auto-reconnect enabled into joining the rogue gateway.`,
      attackerGoal: "Trick roaming client devices into automatically joining an attacker-controlled network.",
    };
  }

  // 4. BLE / Multi-Radio Stalker
  if (norm.includes('ble') || rules.includes('ble')) {
    return {
      attackName: "Multi-Protocol Proximity Correlation (Wi-Fi + BLE Tracking)",
      simpleExplanation: `A Bluetooth Low Energy (BLE) peripheral and an unauthorized Wi-Fi transmitter show synchronized signal strength increases, indicating a single physical attacker carrying both radios approaching the monitored zone.`,
      attackerGoal: "Physical perimeter surveillance and coordinated multi-radio intrusion.",
    };
  }

  // 5. General fallback
  if (narration && narration.trim().length > 0 && !narration.includes('No additional analysis')) {
    return {
      attackName: "Suspicious Radio Signal Anomaly",
      simpleExplanation: narration,
      attackerGoal: "Unauthorized RF transmission exceeding security thresholds.",
    };
  }

  return {
    attackName: "Anomalous Wireless Broadcast Activity",
    simpleExplanation: `This device is emitting unusual Wi-Fi management signals that do not match standard network baselines on '${ssid}'.`,
    attackerGoal: "Potential unauthorized network reconnaissance or spoofing attempt.",
  };
}

function AlertCard({ alert, onResolve, onUnresolve, onWhitelist, onRemoveWhitelist, isResolving, isWhitelisting }: { 
  alert: Alert; 
  onResolve: (id: string) => void; 
  onUnresolve: (id: string) => void; 
  onWhitelist: (id: string) => void;
  onRemoveWhitelist: (id: string, ssid: string, bssid: string) => void;
  isResolving: boolean;
  isWhitelisting: boolean;
}) {
  const [expanded, setExpanded] = useState(!alert.resolved);
  const cfg = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.SUSPICIOUS;

  return (
    <div
      className={`bg-card rounded-2xl border card-shadow transition-all duration-300 overflow-hidden animate-slide-in-up ${
        alert.resolved ? 'opacity-60 border-border/40 bg-muted/10' : 'border-border/60'
      }`}
      style={{ borderLeftWidth: '3px', borderLeftColor: alert.resolved ? '#10B981' : alert.whitelisted ? '#EAB308' : cfg.dot }}
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
              {alert.whitelisted && (
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border text-status-watching bg-status-watching-bg border-status-watching/20">
                  WHITELISTED
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
            <div className="text-lg font-bold tabular-nums" style={{ color: alert.resolved ? '#10B981' : cfg.dot }}>
              {Math.min(100, alert.confidence || 0)}<span className="text-xs font-normal text-muted-foreground">/100</span>
            </div>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, alert.confidence || 0)}%`, background: alert.resolved ? '#10B981' : cfg.dot }} />
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/60 pt-4">
          {/* Prominent High-Visibility AI Threat Intelligence Box */}
          {(() => {
            const threat = getDetailedThreatExplanation(alert.narration, alert.ssid, alert.evidence);
            return (
              <div className="relative overflow-hidden bg-gradient-to-r from-primary/15 via-primary/8 to-background border-2 border-primary/30 rounded-2xl p-4 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary text-primary-foreground text-xs shadow-sm">
                      ✨
                    </span>
                    <span className="text-xs font-bold tracking-wider text-primary uppercase">
                      AI Threat Explanation · In Simple Terms
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                    EXPLAINABLE AI
                  </span>
                </div>

                <div className="space-y-1.5 pt-0.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground bg-primary/20 px-2.5 py-1 rounded-lg border border-primary/30">
                    <span>⚠️ Potential Attack:</span>
                    <span className="text-primary font-bold">{threat.attackName}</span>
                  </div>
                  
                  <div className="text-sm text-foreground/90 leading-relaxed space-y-1">
                    <p><strong>What is happening:</strong> {threat.simpleExplanation}</p>
                    <p className="text-xs text-muted-foreground"><strong>Attacker Objective:</strong> {threat.attackerGoal}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Technical Evidence Proof Table */}
          <div className="space-y-2.5 bg-muted/20 border border-border/60 rounded-2xl p-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Technical Evidence Signals ({alert.evidence.length})
              </h4>
              <span className="text-[10px] font-mono text-muted-foreground">SCORE CONTRIBUTIONS</span>
            </div>
            <div className="space-y-2">
              {alert.evidence.map((e: { rule?: string; label?: string; points?: number; score?: number }, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-foreground font-medium">{e.rule || e.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((e.points || e.score || 0) / 30) * 100)}%`, background: cfg.dot }} />
                    </div>
                    <span className="font-bold font-mono w-10 text-right" style={{ color: cfg.dot }}>+{e.points || e.score || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Button Controls (Resolve / Whitelist / Un-resolve / Remove from Whitelist) */}
          <div className="flex flex-wrap gap-2 pt-1">
            {!alert.resolved ? (
              <button
                onClick={() => onResolve(alert.id)}
                disabled={isResolving}
                className="flex-1 min-w-[130px] bg-primary text-primary-foreground text-xs font-semibold rounded-xl py-2.5 hover:bg-primary/90 transition-all shadow-sm disabled:opacity-60"
              >
                {isResolving ? 'Resolving...' : 'Mark Resolved'}
              </button>
            ) : (
              <button
                onClick={() => onUnresolve(alert.id)}
                disabled={isResolving}
                className="flex-1 min-w-[130px] bg-status-live/15 border border-status-live/40 text-status-live text-xs font-semibold rounded-xl py-2.5 hover:bg-status-live/25 transition-all shadow-sm disabled:opacity-60"
              >
                {isResolving ? 'Updating...' : '↩ Re-open / Mark Active'}
              </button>
            )}

            {!alert.whitelisted ? (
              <button
                onClick={() => onWhitelist(alert.id)}
                disabled={isWhitelisting}
                className="flex-1 min-w-[130px] border border-border bg-card text-foreground text-xs font-semibold rounded-xl py-2.5 hover:bg-muted transition-all disabled:opacity-60"
              >
                {isWhitelisting ? 'Adding...' : 'Add to Whitelist'}
              </button>
            ) : (
              <button
                onClick={() => onRemoveWhitelist(alert.id, alert.ssid, alert.bssid)}
                disabled={isWhitelisting}
                className="flex-1 min-w-[130px] border border-status-flagged/40 bg-status-flagged-bg text-status-flagged text-xs font-semibold rounded-xl py-2.5 hover:bg-status-flagged/20 transition-all disabled:opacity-60"
              >
                {isWhitelisting ? 'Removing...' : '✕ Remove from Whitelist'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Alerts({ 
  selectedDevice, 
  onClearDeviceFilter 
}: { 
  selectedDevice?: string | null; 
  onClearDeviceFilter?: () => void;
}) {
  const [alertList, setAlertList] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [activeDeviceFilter, setActiveDeviceFilter] = useState<string | null>(selectedDevice || null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [whitelistingId, setWhitelistingId] = useState<string | null>(null);

  useEffect(() => {
    setActiveDeviceFilter(selectedDevice || null);
  }, [selectedDevice]);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAlerts();
      if (Array.isArray(data) && data.length > 0) {
        setAlertList(data.map(mapBackendAlert));
      } else {
        const { alerts: fallbackAlerts } = await import('../data/mockData');
        setAlertList(fallbackAlerts.map(mapBackendAlert));
      }
    } catch {
      const { alerts: fallbackAlerts } = await import('../data/mockData');
      setAlertList(fallbackAlerts.map(mapBackendAlert));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleClearFilter = () => {
    setActiveDeviceFilter(null);
    onClearDeviceFilter?.();
  };

  const filters = ['All', 'Active', 'Flagged', 'Suspicious', 'Watching', 'Resolved'];

  const filtered = alertList.filter(a => {
    if (activeDeviceFilter) {
      // Filter by device if selected
      const matchesDevice = a.bssid?.replace(/[:-]/g, '').toUpperCase() === activeDeviceFilter.replace(/[:-]/g, '').toUpperCase() || a.ssid?.includes(activeDeviceFilter);
      if (!matchesDevice) return false;
    }
    if (filter === 'All') return true;
    if (filter === 'Active') return !a.resolved;
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

  const handleUnresolve = async (id: string) => {
    setResolvingId(id);
    try {
      await api.unresolveAlert(id);
      setAlertList(prev => prev.map(a => a.id === id ? { ...a, resolved: false } : a));
    } catch (e) {
      console.error('Unresolve failed:', e);
      window.alert('Failed to re-open alert: ' + (e instanceof Error ? e.message : 'Unknown error'));
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

  const handleRemoveWhitelist = async (id: string, ssid: string, bssid: string) => {
    setWhitelistingId(id);
    try {
      await api.removeWhitelist(ssid, bssid);
      setAlertList(prev => prev.map(a => a.id === id ? { ...a, whitelisted: false } : a));
    } catch (e) {
      console.error('Remove whitelist failed:', e);
      window.alert('Failed to remove from whitelist: ' + (e instanceof Error ? e.message : 'Unknown error'));
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Alerts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {alertList.filter(a => !a.resolved).length} active · {alertList.filter(a => a.resolved).length} resolved
          </p>
        </div>

        {activeDeviceFilter && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl px-3 py-1.5 text-xs text-primary animate-fade-in">
            <span>Filtered by device: <strong className="font-mono">{activeDeviceFilter}</strong></span>
            <button
              onClick={handleClearFilter}
              className="ml-1 bg-primary text-primary-foreground font-semibold px-2 py-0.5 rounded-lg hover:bg-primary/90 transition-colors"
            >
              ✕ Show All Alerts
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => {
          const count = alertList.filter(a => {
            if (activeDeviceFilter) {
              const matchesDevice = a.bssid?.replace(/[:-]/g, '').toUpperCase() === activeDeviceFilter.replace(/[:-]/g, '').toUpperCase() || a.ssid?.includes(activeDeviceFilter);
              if (!matchesDevice) return false;
            }
            if (f === 'All') return true;
            if (f === 'Active') return !a.resolved;
            if (f === 'Resolved') return a.resolved;
            return a.severity === f.toUpperCase() && !a.resolved;
          }).length;

          return (
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
              <span className="ml-1.5 opacity-70">
                {count}
              </span>
            </button>
          );
        })}
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
              onUnresolve={handleUnresolve}
              onWhitelist={handleWhitelist}
              onRemoveWhitelist={handleRemoveWhitelist}
              isResolving={resolvingId === alert.id}
              isWhitelisting={whitelistingId === alert.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}