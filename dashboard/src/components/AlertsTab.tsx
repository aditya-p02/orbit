import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle, Shield, Wifi } from 'lucide-react';
import { useState } from 'react';
import { classNames, formatDateTime, getScoreColor, getScoreBg } from '../utils/helpers';
import type { Alert, Evidence } from '../types';

interface AlertsTabProps {
  alerts: Alert[];
  onResolve: (id: number) => void;
}

interface EvidenceItemProps {
  evidence: Evidence;
}

function EvidenceItem({ evidence }: EvidenceItemProps) {
  const isHigh = evidence.points >= 25;
  const isMedium = evidence.points >= 15;
  const color = isHigh ? 'danger' : isMedium ? 'warning' : 'info';
  
  return (
    <div className="flex gap-3 py-2 px-3 bg-bg/50 rounded-xl border border-border/50">
      <span className={classNames(
        'px-2.5 py-1 text-xs font-mono font-semibold rounded-lg border flex-shrink-0',
        `bg-${color}-bg text-${color} border-${color}-border`
      )}>
        +{evidence.points}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-text capitalize">{evidence.rule.replace(/_/g, ' ')}</p>
        {evidence.detail && (
          <p className="text-sm text-text-muted mt-0.5 line-clamp-2">{evidence.detail}</p>
        )}
      </div>
    </div>
  );
}

export function AlertsTab({ alerts, onResolve }: AlertsTabProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const getAlertType = (alert: Alert) => {
    const rules = alert.evidence.map(e => e.rule);
    if (rules.includes('karma_multi_ssid')) return { label: 'KARMA ATTACK', icon: AlertTriangle, color: 'warning' as const };
    if (rules.includes('handshake_eapol_capture')) return { label: 'HANDSHAKE CAPTURE', icon: Shield, color: 'danger' as const };
    if (rules.includes('ssid_collision')) return { label: 'EVIL TWIN', icon: Wifi, color: 'danger' as const };
    return { label: 'THREAT', icon: AlertTriangle, color: 'info' as const };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Alert Feed</h1>
          <p className="text-sm text-text-muted mt-1">
            {alerts.length} total alerts · {alerts.filter(a => !a.resolved).length} unresolved
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-success-bg flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Network Secure</h3>
            <p className="text-text-muted">No threats detected. All monitored devices are trusted.</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const isExpanded = expandedId === alert.id;
            const alertType = getAlertType(alert);
            const Icon = alertType.icon;
            
            return (
              <div
                key={alert.id}
                className={classNames(
                  'bg-card border rounded-2xl overflow-hidden transition-all duration-300',
                  isExpanded ? 'border-primary/30 shadow-lg shadow-primary/5' : 'border-border hover:border-border-hover'
                )}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                  className="w-full p-4 flex items-start gap-4 hover:bg-surface-hover/50 transition-colors text-left"
                >
                  <div className={classNames(
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    `bg-${alertType.color}-bg text-${alertType.color}`
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-xs font-mono text-text-muted">#{alert.id}</span>
                      <span className={classNames(
                        'px-2 py-0.5 text-xs font-medium rounded-full border',
                        alert.resolved 
                          ? 'bg-success-bg text-success border-success-border'
                          : `bg-${alertType.color}-bg text-${alertType.color} border-${alertType.color}-border`
                      )}>
                        {alertType.label}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-full border"
                        style={{ 
                          backgroundColor: `var(--color-${getScoreBg(alert.score).replace('bg-', '')})`,
                          color: `var(--color-${getScoreColor(alert.score).replace('text-', '')})`,
                          borderColor: `var(--color-${getScoreColor(alert.score).replace('text-', '')})`
                        }}>
                        Score: {alert.score}
                      </span>
                      <span className="text-xs text-text-muted font-mono">{formatDateTime(alert.timestamp)}</span>
                      {alert.resolved && (
                        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-success-bg text-success border-success-border">
                          <CheckCircle className="w-3 h-3" /> Resolved
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-sm text-text-muted">{alert.bssid}</p>
                    {alert.ssid && <p className="text-sm text-text-muted mt-0.5">{alert.ssid}</p>}
                    {alert.narration && (
                      <p className="mt-2 text-sm text-text-dim italic flex items-center gap-1.5">
                        <span className="text-primary">[AI]</span> {alert.narration}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-text-muted" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-text-muted" />
                    )}
                    {!alert.resolved && !isExpanded && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onResolve(alert.id);
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-danger-bg text-danger border border-danger-border hover:bg-danger-bg/80 transition-colors"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border bg-surface/50 p-4 animate-slide-down">
                    <h4 className="text-sm font-semibold text-text-muted mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      Evidence Breakdown
                    </h4>
                    <div className="space-y-2">
                      {alert.evidence.map((e, i) => (
                        <EvidenceItem key={i} evidence={e} />
                      ))}
                    </div>
                    {!alert.resolved && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onResolve(alert.id);
                        }}
                        className="mt-4 w-full px-4 py-2.5 rounded-xl bg-danger-bg text-danger border border-danger-border hover:bg-danger-bg/80 font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Mark as Resolved
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-down {
          animation: slide-down 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}