import { List, Filter, Clock, AlertTriangle, Wifi, Shield } from 'lucide-react';
import { useState, useMemo } from 'react';
import { classNames, formatDateTime, getScoreColor, getScoreBg } from '../utils/helpers';
import type { Observation } from '../types';

interface TimelineTabProps {
  observations: Observation[];
}

export function TimelineTab({ observations }: TimelineTabProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');

  const eventTypes = useMemo(() => {
    const types = new Set(observations.map(o => o.event_type));
    return Array.from(types).sort();
  }, [observations]);

  const devices = useMemo(() => {
    const devs = new Set(observations.map(o => o.device_mac));
    return Array.from(devs).sort();
  }, [observations]);

  const filteredObservations = useMemo(() => {
    return observations
      .filter((o) => {
        if (typeFilter !== 'all' && o.event_type !== typeFilter) return false;
        if (deviceFilter !== 'all' && o.device_mac !== deviceFilter) return false;
        if (search) {
          const term = search.toLowerCase();
          return (
            o.event_type.toLowerCase().includes(term) ||
            o.device_mac.toLowerCase().includes(term) ||
            (o.detail?.toLowerCase().includes(term) ?? false)
          );
        }
        return true;
      })
      .slice()
      .reverse(); // newest first
  }, [observations, search, typeFilter, deviceFilter]);

  const getEventIcon = (type: string) => {
    if (type.includes('karma')) return <Wifi className="w-4 h-4" />;
    if (type.includes('handshake') || type.includes('deauth')) return <Shield className="w-4 h-4" />;
    if (type.includes('ssid') || type.includes('security') || type.includes('channel')) return <AlertTriangle className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  const getEventColor = (type: string) => {
    if (type.includes('karma')) return 'warning';
    if (type.includes('handshake') || type.includes('deauth')) return 'danger';
    if (type.includes('ssid') || type.includes('security') || type.includes('channel')) return 'danger';
    return 'info';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Threat Timeline</h1>
          <p className="text-sm text-text-muted mt-1">
            {observations.length} total events · {filteredObservations.length} shown
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
            <input
              type="text"
              placeholder="Search events, devices, details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg border border-border rounded-xl text-sm text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all min-w-[160px]"
          >
            <option value="all">All Types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="px-4 py-2 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all min-w-[160px]"
          >
            <option value="all">All Devices</option>
            {devices.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto max-h-[calc(100vh-300px)]">
          <table className="w-full" role="grid">
            <thead>
              <tr className="bg-surface-hover border-b border-border sticky top-0 z-10">
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Device</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Event Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Details</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredObservations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-text-muted">
                    <div className="flex flex-col items-center gap-3">
                      <List className="w-12 h-12 text-text-dim" />
                      <p>No events match your filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredObservations.map((obs) => {
                  const color = getEventColor(obs.event_type);
                  const Icon = getEventIcon(obs.event_type);
                  return (
                    <tr
                      key={obs.id}
                      className="hover:bg-surface-hover/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-sm text-text-muted whitespace-nowrap">
                        {formatDateTime(obs.timestamp)}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">
                        {obs.device_mac}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={classNames(
                            'p-1.5 rounded-lg flex-shrink-0',
                            `bg-${color}-bg text-${color}`
                          )}>
                            {Icon}
                          </span>
                          <span className="text-sm font-medium capitalize">{obs.event_type.replace(/_/g, ' ')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted max-w-md truncate">
                        {obs.detail || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {obs.score !== null && (
                          <span className={classNames(
                            'px-2.5 py-1 text-xs font-mono font-semibold rounded-lg border',
                            `bg-${getScoreBg(obs.score).replace('bg-', '')} text-${getScoreColor(obs.score).replace('text-', '')} border-${getScoreColor(obs.score).replace('text-', '')}`
                          )}>
                            {obs.score}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}