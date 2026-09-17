import { ShieldCheck, Plus, Trash2, Check, Loader2, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { classNames, formatDateTime } from '../utils/helpers';
import { api } from '../utils/api';
import type { WhitelistEntry } from '../types';

interface WhitelistTabProps {
  onRefresh: () => void;
}

export function WhitelistTab({ onRefresh }: WhitelistTabProps) {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSsid, setNewSsid] = useState('');
  const [newBssid, setNewBssid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ ssid?: string; bssid?: string }>({});

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      const data = await api.getWhitelist();
      setEntries(data);
    } catch (e) {
      console.error('Failed to load whitelist:', e);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: { ssid?: string; bssid?: string } = {};
    if (!newSsid.trim()) newErrors.ssid = 'SSID is required';
    if (!newBssid.trim()) newErrors.bssid = 'BSSID is required';
    else if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(newBssid)) {
      newErrors.bssid = 'Invalid MAC format (use AA:BB:CC:DD:EE:FF)';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await api.addWhitelist(newSsid.trim(), newBssid.trim().toUpperCase().replace(/-/g, ':'));
      setNewSsid('');
      setNewBssid('');
      onRefresh();
      loadEntries();
    } catch (e) {
      console.error('Failed to add whitelist entry:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (ssid: string, bssid: string) => {
    if (!confirm(`Remove ${ssid} (${bssid}) from whitelist?`)) return;
    try {
      await api.removeWhitelist(ssid, bssid);
      onRefresh();
      loadEntries();
    } catch (e) {
      console.error('Failed to remove whitelist entry:', e);
    }
  };

  const formatMac = (mac: string) => mac.toUpperCase().replace(/-/g, ':');

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Trusted Access Points</h1>
          <p className="text-sm text-text-muted mt-1">
            {entries.length} trusted APs configured
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-text mb-4">Add Trusted Access Point</h2>
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 max-w-2xl">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-text-muted mb-1.5">SSID</label>
              <input
                type="text"
                placeholder="e.g. HomeNet-5G"
                value={newSsid}
                onChange={(e) => setNewSsid(e.target.value)}
                className={classNames(
                  'w-full px-4 py-2.5 bg-bg border rounded-xl text-sm text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all',
                  errors.ssid ? 'border-danger' : 'border-border'
                )}
                disabled={submitting}
              />
              {errors.ssid && <p className="mt-1.5 text-xs text-danger flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.ssid}</p>}
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-text-muted mb-1.5">BSSID (MAC)</label>
              <input
                type="text"
                placeholder="e.g. AA:BB:CC:DD:EE:FF"
                value={newBssid}
                onChange={(e) => setNewBssid(e.target.value)}
                className={classNames(
                  'w-full px-4 py-2.5 bg-bg border rounded-xl text-sm text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all',
                  errors.bssid ? 'border-danger' : 'border-border'
                )}
                disabled={submitting}
              />
              {errors.bssid && <p className="mt-1.5 text-xs text-danger flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.bssid}</p>}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={classNames(
                'px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 self-end',
                submitting
                  ? 'bg-primary/50 text-primary/70 cursor-not-allowed'
                  : 'bg-primary text-bg hover:bg-primary-hover'
              )}
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? 'Adding...' : 'Add'}</span>
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
              <p className="text-text-muted">Loading whitelist...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center">
              <ShieldCheck className="w-16 h-16 text-text-dim mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-1">No Trusted APs</h3>
              <p className="text-text-muted">Add your trusted access points above to prevent false positives</p>
            </div>
          ) : (
            <table className="w-full" role="grid">
              <thead>
                <tr className="bg-surface-hover border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">SSID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">BSSID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Added</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {entries.map((entry) => (
                  <tr key={`${entry.ssid}-${entry.bssid}`} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="px-4 py-4 font-medium text-text">{entry.ssid}</td>
                    <td className="px-4 py-4 font-mono text-sm text-text-muted">{formatMac(entry.bssid)}</td>
                    <td className="px-4 py-4 text-sm text-text-muted">{formatDateTime(entry.added_at)}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-success-bg text-success border border-success-border">
                        <Check className="w-3 h-3" />
                        Trusted
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => handleRemove(entry.ssid, entry.bssid)}
                        className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-danger-bg transition-colors"
                        aria-label="Remove from whitelist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}