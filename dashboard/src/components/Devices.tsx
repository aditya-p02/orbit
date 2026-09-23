import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Device } from '../lib/api';

// Map backend device to frontend format
function mapBackendDevice(d: any): Device {
  const normMac = String(d.mac || d.bssid || d.id || '').toUpperCase().replace(/[:-]/g, '');
  const formattedMac = normMac.length === 12
    ? normMac.match(/.{1,2}/g)?.join(':') || normMac
    : (d.mac || d.bssid || d.id || '—');

  const rawType = d.device_type || d.deviceType || (normMac.startsWith('EE11') ? 'BLE' : normMac.startsWith('1234') ? 'Client' : 'AP');
  const dType = rawType.toUpperCase();

  let defaultSsid = 'Hidden Network';
  if (dType === 'BLE') defaultSsid = 'BLE Tracking Beacon';
  else if (dType === 'CLIENT') defaultSsid = 'Client Station';

  return {
    id: normMac || d.id,
    bssid: formattedMac,
    ssid: d.ssid || defaultSsid,
    vendor: d.vendor || (dType === 'BLE' ? 'BLE Peripheral' : dType === 'CLIENT' ? 'Client Hardware' : 'Unknown Vendor'),
    deviceType: dType,
    device_type: dType,
    state: (d.state || 'Unknown').toUpperCase(),
    score: d.score || 0,
    lastSeen: d.last_seen ? new Date(d.last_seen * 1000).toLocaleTimeString() : 'Just now',
    channel: d.channel || 0,
    rssi: d.rssi || -80,
    evidence: d.evidence || [],
    aiNarration: d.narration || d.aiNarration || 'No additional analysis available.',
  };
}

const stateConfig = {
  FLAGGED: { label: 'Flagged', color: 'text-status-flagged bg-status-flagged-bg border-status-flagged/20' },
  SUSPICIOUS: { label: 'Suspicious', color: 'text-status-suspicious bg-status-suspicious-bg border-status-suspicious/20' },
  WATCHING: { label: 'Watching', color: 'text-status-watching bg-status-watching-bg border-status-watching/20' },
  UNKNOWN: { label: 'Unknown', color: 'text-muted-foreground bg-muted border-border' },
  LIVE: { label: 'Live', color: 'text-status-live bg-status-live-bg border-status-live/20' },
};

const scoreDotColor = (score: number) => {
  if (score >= 60) return '#EF4444';
  if (score >= 30) return '#F59E0B';
  if (score >= 10) return '#EAB308';
  return '#9CA3AF';
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

function DeviceDrawer({ device, onClose }: { device: Device; onClose: () => void }) {
  const cfg = stateConfig[device.state as keyof typeof stateConfig] || stateConfig.UNKNOWN;
  const [whitelisting, setWhitelisting] = useState(false);

  const handleWhitelist = async () => {
    setWhitelisting(true);
    try {
      await api.whitelistAlert(device.ssid, device.bssid);
      setWhitelisting(false);
      onClose();
    } catch (e) {
      setWhitelisting(false);
      alert('Failed to whitelist: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  };

  const handleRemoveWhitelist = async () => {
    setWhitelisting(true);
    try {
      await api.removeWhitelist(device.ssid, device.bssid);
      setWhitelisting(false);
      onClose();
    } catch (e) {
      setWhitelisting(false);
      alert('Failed to remove from whitelist: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
      <div
        className="relative bg-card w-full max-w-md h-full shadow-2xl animate-slide-in-right overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${cfg.color}`}>
                {cfg.label}
              </span>
              <h2 className="text-xl font-bold text-foreground mt-2">{device.ssid}</h2>
              <p className="text-xs text-muted-foreground">{device.vendor}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="bg-muted/50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Threat Score</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: scoreDotColor(device.score) }}>
                {device.score}<span className="text-sm font-normal text-muted-foreground"> / 100</span>
              </span>
            </div>
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${device.score}%`, background: scoreDotColor(device.score) }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Identity</h3>
            <div className="space-y-2">
              {[
                { label: 'BSSID', value: device.bssid, mono: true, copyable: true },
                { label: 'SSID', value: device.ssid },
                { label: 'Vendor', value: device.vendor },
                { label: 'Channel', value: `CH ${device.channel}` },
                { label: 'RSSI', value: `${device.rssi} dBm` },
                { label: 'Last Seen', value: device.lastSeen },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-border/60">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium text-foreground ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                    {row.copyable && (
                      <button
                        onClick={() => navigator.clipboard.writeText(row.value as string)}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Copy"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {device.evidence.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Evidence</h3>
              <div className="space-y-2">
                {device.evidence.map((e: { rule?: string; label?: string; points?: number; score?: number }, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-xs text-foreground mb-1">{e.rule || e.label}</div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${((e.points || 0) / 30) * 100}%`, background: scoreDotColor(device.score) }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-bold font-mono text-status-flagged w-8 text-right">+{e.points || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prominent AI Threat Breakdown */}
          {(() => {
            const threat = getDetailedThreatExplanation(device.aiNarration, device.ssid, device.evidence);
            return (
              <div className="relative overflow-hidden bg-gradient-to-r from-primary/15 via-primary/8 to-background border-2 border-primary/30 rounded-2xl p-4 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-primary text-primary-foreground text-xs shadow-sm">
                      ✨
                    </span>
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
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

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleWhitelist}
              disabled={whitelisting}
              className="flex-1 bg-primary text-primary-foreground text-sm font-medium rounded-xl py-2.5 hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {whitelisting ? 'Updating...' : 'Add to Whitelist'}
            </button>
            <button
              onClick={handleRemoveWhitelist}
              disabled={whitelisting}
              className="flex-1 border border-status-flagged/40 bg-status-flagged-bg text-status-flagged text-sm font-medium rounded-xl py-2.5 hover:bg-status-flagged/20 transition-colors disabled:opacity-60"
            >
              {whitelisting ? 'Updating...' : '✕ Remove from Whitelist'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Devices({ selectedDevice, onSelectDevice }: { selectedDevice: string | null; onSelectDevice: (id: string) => void }) {
  const [filter, setFilter] = useState<string>('All');
  const [drawerDevice, setDrawerDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getDevices();
      if (Array.isArray(data) && data.length > 0) {
        // Deduplicate devices by normalized MAC address
        const seen = new Set<string>();
        const unique: Device[] = [];
        for (const item of data) {
          const mapped = mapBackendDevice(item);
          const key = mapped.id.replace(/[:-]/g, '').toUpperCase();
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(mapped);
          }
        }
        setDevices(unique);
      } else {
        const { devices: fallbackDevices } = await import('../data/mockData');
        const seen = new Set<string>();
        const unique: Device[] = [];
        for (const item of fallbackDevices) {
          const mapped = mapBackendDevice(item);
          const key = mapped.id.replace(/[:-]/g, '').toUpperCase();
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(mapped);
          }
        }
        setDevices(unique);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const filters = ['All', 'Flagged', 'Suspicious', 'Watching', 'AP', 'Clients', 'BLE', 'Unknown'];

  const filtered = devices.filter(d => {
    if (filter === 'All') return true;
    if (filter === 'AP') return (d.deviceType || d.device_type) === 'AP';
    if (filter === 'Clients') return (d.deviceType || d.device_type) === 'CLIENT';
    if (filter === 'BLE') return (d.deviceType || d.device_type) === 'BLE';
    return d.state === filter.toUpperCase();
  });

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading devices...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="bg-status-flagged-bg border border-status-flagged/20 rounded-2xl p-4 text-status-flagged">
          <div className="font-semibold">Error loading devices</div>
          <div className="text-sm mt-1">{error}</div>
          <button onClick={fetchDevices} className="mt-3 text-xs text-primary hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Detected Devices</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{devices.length} devices in wireless environment</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot" />
          Live monitoring
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
            {f !== 'All' && (
              <span className="ml-1.5 opacity-70">
                {devices.filter(d => d.state === f.toUpperCase()).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(device => {
          const cfg = stateConfig[device.state as keyof typeof stateConfig] || stateConfig.UNKNOWN;
          const isSelected = selectedDevice === device.bssid;
          return (
            <div
              key={device.bssid}
              onClick={() => {
                setDrawerDevice(device);
                onSelectDevice(device.bssid);
              }}
              className={`group bg-card rounded-2xl border p-4 flex items-center gap-4 cursor-pointer transition-all duration-150 hover:-translate-y-px hover:card-shadow-md ${
                isSelected ? 'border-primary/40 bg-secondary/30' : 'border-border/60 card-shadow'
              }`}
            >
              <div className="flex-shrink-0">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: scoreDotColor(device.score) }}
                />
              </div>

              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-4 gap-1 sm:gap-4 items-center">
                <div className="sm:col-span-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">{device.ssid}</span>
                    {device.deviceType === 'BLE' && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                        BLE
                      </span>
                    )}
                    {device.deviceType === 'CLIENT' && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        CLIENT
                      </span>
                    )}
                    {device.deviceType === 'AP' && device.state === 'UNKNOWN' && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                        AP
                      </span>
                    )}
                    {device.state === 'FLAGGED' && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-status-flagged-bg text-status-flagged border border-status-flagged/30">
                        ROGUE CLONE
                      </span>
                    )}
                    {device.state === 'SUSPICIOUS' && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-status-suspicious-bg text-status-suspicious border border-status-suspicious/30">
                        PROBE TRAP
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{device.vendor}</div>
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-mono text-muted-foreground">{device.bssid}</div>
                  <div className="text-xs text-muted-foreground">CH {device.channel} {device.rssi} dBm</div>
                </div>
                <div className="hidden sm:block">
                  <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${device.score}%`, background: scoreDotColor(device.score) }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: scoreDotColor(device.score) }}>
                    {device.score}
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground flex-shrink-0">{device.lastSeen}</div>

              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="View details"
                  onClick={e => { e.stopPropagation(); setDrawerDevice(device); onSelectDevice(device.bssid); }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {drawerDevice && (
        <DeviceDrawer device={drawerDevice} onClose={() => setDrawerDevice(null)} />
      )}
    </div>
  );
}