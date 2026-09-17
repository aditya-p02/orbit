import { WifiOff, Search, MoreVertical } from 'lucide-react';
import { useState, useMemo } from 'react';
import { classNames, formatMac, getStateConfig, getScoreColor, getScoreBg } from '../utils/helpers';
import type { Device } from '../types';

interface DevicesTabProps {
  devices: Device[];
  wsConnected: boolean;
}

type SortKey = keyof Pick<Device, 'ssid' | 'mac' | 'vendor' | 'state' | 'score' | 'last_seen'>;

export function DevicesTab({ devices, wsConnected }: DevicesTabProps) {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' });

  const filteredDevices = useMemo(() => {
    return devices
      .filter((d) => {
        if (stateFilter !== 'all' && d.state !== stateFilter) return false;
        if (search) {
          const term = search.toLowerCase();
          return (
            (d.ssid?.toLowerCase().includes(term) ?? false) ||
            d.mac.toLowerCase().includes(term) ||
            (d.vendor?.toLowerCase().includes(term) ?? false)
          );
        }
        return true;
      })
      .sort((a, b) => {
        let aVal: string | number = a[sortConfig.key] ?? '';
        let bVal: string | number = b[sortConfig.key] ?? '';
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        if (aVal < bVal) return sortConfig.dir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.dir === 'asc' ? 1 : -1;
        return 0;
      });
  }, [devices, search, stateFilter, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const stateCounts = useMemo(() => {
    const counts = { all: devices.length, Flagged: 0, Suspicious: 0, Watching: 0, Unknown: 0 };
    devices.forEach((d) => counts[d.state]++);
    return counts;
  }, [devices]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Devices</h1>
          <p className="text-sm text-text-muted mt-1">
            {devices.length} devices detected · {stateCounts.Flagged} flagged · {stateCounts.Suspicious} suspicious
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={classNames(
            'px-2 py-1 text-xs rounded-full flex items-center gap-1.5 font-medium',
            wsConnected ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          )}>
            <span className="w-1.5 h-1.5 rounded-full" />
            {wsConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
            <input
              type="text"
              placeholder="Search SSID, BSSID, vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg border border-border rounded-xl text-sm text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="px-4 py-2 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all min-w-[140px]"
          >
            <option value="all">All States ({stateCounts.all})</option>
            <option value="Flagged">Flagged ({stateCounts.Flagged})</option>
            <option value="Suspicious">Suspicious ({stateCounts.Suspicious})</option>
            <option value="Watching">Watching ({stateCounts.Watching})</option>
            <option value="Unknown">Unknown ({stateCounts.Unknown})</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" role="grid">
            <thead>
              <tr className="bg-surface-hover border-b border-border">
                {[
                  { key: 'ssid' as SortKey, label: 'SSID' },
                  { key: 'mac' as SortKey, label: 'BSSID' },
                  { key: 'vendor' as SortKey, label: 'Vendor' },
                  { key: 'state' as SortKey, label: 'State' },
                  { key: 'score' as SortKey, label: 'Score' },
                  { key: 'last_seen' as SortKey, label: 'Last Seen' },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:text-text transition-colors select-none flex items-center gap-1.5"
                    style={{ userSelect: 'none' }}
                  >
                    {col.label}
                    {sortConfig.key === col.key && (
                      <span className="text-primary">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                    <div className="flex flex-col items-center gap-3">
                      <WifiOff className="w-12 h-12 text-text-dim" />
                      <p>No devices match your filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device) => {
                  const stateConfig = getStateConfig(device.state);
                  return (
                    <tr
                      key={device.mac}
                      className="hover:bg-surface-hover/50 transition-colors"
                    >
                      <td className="px-4 py-4 font-mono text-sm">{device.ssid || <span className="text-text-dim">—</span>}</td>
                      <td className="px-4 py-4 font-mono text-sm text-text-muted">{formatMac(device.mac)}</td>
                      <td className="px-4 py-4 text-sm text-text-muted">{device.vendor || 'unknown'}</td>
                      <td className="px-4 py-4">
                        <span className={classNames(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
                          stateConfig.bg, stateConfig.text, stateConfig.border
                        )}>
                          <span className={classNames('w-1.5 h-1.5 rounded-full', stateConfig.dot)} />
                          {stateConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={classNames('font-mono font-semibold', getScoreColor(device.score))}>
                            {device.score}
                          </span>
                          <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
                            <div
                              className={classNames('h-full rounded-full transition-all duration-500', getScoreBg(device.score).replace('bg-', 'bg-'))}
                              style={{ width: `${Math.min(device.score, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-text-muted font-mono">
                        {new Date(device.last_seen * 1000).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
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