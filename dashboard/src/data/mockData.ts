export type DeviceState = 'FLAGGED' | 'SUSPICIOUS' | 'WATCHING' | 'UNKNOWN' | 'LIVE';
export type AlertSeverity = 'FLAGGED' | 'SUSPICIOUS' | 'WATCHING';
export type NodeStatus = 'LIVE' | 'OFFLINE' | 'RECONNECTING';

export interface Device {
  id: string;
  state: DeviceState;
  ssid: string;
  bssid: string;
  vendor: string;
  score: number;
  lastSeen: string;
  lastSeenMs: number;
  channel: number;
  rssi: number;
  evidence: Evidence[];
  aiNarration: string;
}

export interface Evidence {
  label: string;
  score: number;
}

export interface Alert {
  id: string;
  deviceId: string;
  severity: AlertSeverity;
  ssid: string;
  bssid: string;
  vendor: string;
  timestamp: string;
  confidence: number;
  evidence: Evidence[];
  aiNarration: string;
  resolved: boolean;
}

export interface NodeData {
  id: string;
  name: string;
  status: NodeStatus;
  framesReceived: number;
  framesPerSec: number;
  queueDepth: number;
  lastFrameMs: number;
  sparkline: number[];
  queueHistory: number[];
}

export interface TimelineEvent {
  id: string;
  deviceId: string;
  ssid: string;
  bssid: string;
  timestamp: string;
  type: string;
  severity: AlertSeverity | 'UNKNOWN' | 'WATCHING';
  score: number;
  description: string;
}

export interface ProximityDevice {
  id: string;
  ssid: string;
  state: DeviceState;
  x: number;
  y: number;
  rssiA: number;
  rssiB: number;
}

export const devices: Device[] = [
  {
    id: 'd1',
    state: 'FLAGGED',
    ssid: 'HomeNet-5G',
    bssid: 'AABBCC001199',
    vendor: 'Espressif Systems',
    score: 140,
    lastSeen: '3s ago',
    lastSeenMs: 3000,
    channel: 11,
    rssi: -44,
    evidence: [
      { label: 'SSID Collision', score: 30 },
      { label: 'Security Downgrade', score: 25 },
      { label: 'Channel Mismatch', score: 15 },
      { label: 'RSSI Anomaly (Z-Score)', score: 15 },
      { label: 'Handshake Deauth Burst', score: 25 },
      { label: 'EAPOL Capture Attempt', score: 30 },
    ],
    aiNarration: '⚠️ Sus alert: A rogue device is straight-up clone-broadcasting HomeNet-5G with zero encryption on the wrong channel. Textbook Evil Twin trying to bait your devices into connecting.',
  },
  {
    id: 'd2',
    state: 'SUSPICIOUS',
    ssid: 'KarmaNet',
    bssid: 'EEFF00112233',
    vendor: 'Realtek Semiconductor',
    score: 55,
    lastSeen: '12s ago',
    lastSeenMs: 12000,
    channel: 6,
    rssi: -68,
    evidence: [
      { label: 'Multi-SSID Probe Responder', score: 30 },
      { label: 'Untrusted Network Responses', score: 25 },
    ],
    aiNarration: '🎣 Major Catfish Behavior: This AP is answering every Wi-Fi probe request pretending to be whatever network your device asks for. Pure Karma trap.',
  },
  {
    id: 'd3',
    state: 'UNKNOWN',
    ssid: 'Free_Cafe_WiFi',
    bssid: 'DEADBEEF0001',
    vendor: 'Intel Corporation',
    score: 0,
    lastSeen: '45s ago',
    lastSeenMs: 45000,
    channel: 3,
    rssi: -72,
    evidence: [],
    aiNarration: 'Public open AP operating nominally. No rogue indicators detected.',
  },
  {
    id: 'd4',
    state: 'UNKNOWN',
    ssid: 'NETGEAR-Office',
    bssid: 'CCDDEE003344',
    vendor: 'Netgear Inc.',
    score: 0,
    lastSeen: '2m ago',
    lastSeenMs: 120000,
    channel: 1,
    rssi: -58,
    evidence: [],
    aiNarration: 'Legitimate enterprise mesh AP matching baseline encryption signature.',
  },
  {
    id: 'd5',
    state: 'UNKNOWN',
    ssid: 'AndroidAP',
    bssid: '50C7BF112233',
    vendor: 'TP-Link / Samsung',
    score: 0,
    lastSeen: '28s ago',
    lastSeenMs: 28000,
    channel: 6,
    rssi: -62,
    evidence: [],
    aiNarration: 'Standard client mobile hotspot. No unauthorized management frames observed.',
  },
  {
    id: 'd6',
    state: 'UNKNOWN',
    ssid: 'HomeNet-5G (Trusted)',
    bssid: 'AABBCC001122',
    vendor: 'Cisco Systems',
    score: 0,
    lastSeen: '1s ago',
    lastSeenMs: 1000,
    channel: 6,
    rssi: -38,
    evidence: [],
    aiNarration: 'Authorized baseline access point. Encryption and parameters verified.',
  },
  {
    id: 'd7',
    state: 'UNKNOWN',
    ssid: 'Client Station',
    bssid: '123456789ABC',
    vendor: 'Apple Inc.',
    score: 0,
    lastSeen: '5s ago',
    lastSeenMs: 5000,
    channel: 6,
    rssi: -50,
    evidence: [],
    aiNarration: 'Authenticated wireless client station active in local BSS.',
  },
  {
    id: 'd8',
    state: 'WATCHING',
    ssid: 'BLE Tracking Beacon',
    bssid: 'EE1122334455',
    vendor: 'BLE Peripheral',
    score: 20,
    lastSeen: '2s ago',
    lastSeenMs: 2000,
    channel: 0,
    rssi: -60,
    evidence: [
      { label: 'BLE Proximity Lockstep', score: 20 },
    ],
    aiNarration: 'BLE beacon detected in proximity airspace. Correlated with physical presence.',
  },
];

export const alerts: Alert[] = [
  {
    id: 'a1',
    deviceId: 'd1',
    severity: 'FLAGGED',
    ssid: 'HomeNet-5G',
    bssid: 'AABBCC001199',
    vendor: 'Espressif Systems',
    timestamp: '14:23:01',
    confidence: 140,
    evidence: [
      { label: 'SSID Collision', score: 30 },
      { label: 'Security Downgrade', score: 25 },
      { label: 'Channel Mismatch', score: 15 },
      { label: 'RSSI Anomaly', score: 15 },
      { label: 'Deauth Burst', score: 25 },
      { label: 'EAPOL Capture Attempt', score: 30 },
    ],
    aiNarration: '⚠️ Sus alert: A rogue device is straight-up clone-broadcasting HomeNet-5G with zero encryption on the wrong channel. Textbook Evil Twin trying to bait your devices into connecting.',
    resolved: false,
  },
  {
    id: 'a2',
    deviceId: 'd2',
    severity: 'SUSPICIOUS',
    ssid: 'KarmaNet',
    bssid: 'EEFF00112233',
    vendor: 'Realtek Semiconductor',
    timestamp: '14:19:44',
    confidence: 55,
    evidence: [
      { label: 'Multi-SSID Probe Responder', score: 30 },
      { label: 'Untrusted Network Responses', score: 25 },
    ],
    aiNarration: '🎣 Major Catfish Behavior: This AP is answering every Wi-Fi probe request pretending to be whatever network your device asks for. Pure Karma trap.',
    resolved: false,
  },
];

export const nodes: NodeData[] = [
  {
    id: 'n1',
    name: 'Node A',
    status: 'LIVE',
    framesReceived: 12482,
    framesPerSec: 18.4,
    queueDepth: 12,
    lastFrameMs: 300,
    sparkline: [12, 18, 15, 22, 19, 24, 18, 21, 16, 20, 18, 23, 19, 18, 22, 20, 18, 19, 21, 18],
    queueHistory: [8, 10, 12, 11, 14, 13, 12, 10, 11, 12, 13, 14, 12, 11, 12, 13, 12, 12, 11, 12],
  },
  {
    id: 'n2',
    name: 'Node B',
    status: 'LIVE',
    framesReceived: 9841,
    framesPerSec: 14.2,
    queueDepth: 8,
    lastFrameMs: 200,
    sparkline: [10, 14, 12, 16, 13, 18, 14, 15, 12, 16, 14, 17, 13, 14, 16, 14, 12, 15, 14, 14],
    queueHistory: [6, 7, 8, 7, 9, 8, 7, 8, 9, 8, 7, 8, 8, 7, 8, 9, 8, 7, 8, 8],
  },
];

export const timelineEvents: TimelineEvent[] = [
  {
    id: 't1',
    deviceId: 'd1',
    ssid: 'HomeNet-5G [Rogue Clone]',
    bssid: 'AABBCC001199',
    timestamp: '00:24:50',
    type: 'SSID Collision Detected',
    severity: 'FLAGGED',
    score: 30,
    description: 'Rogue AP broadcasting SSID "HomeNet-5G" matching whitelisted network but with unverified hardware address AABBCC001199.',
  },
  {
    id: 't2',
    deviceId: 'd1',
    ssid: 'HomeNet-5G [Rogue Clone]',
    bssid: 'AABBCC001199',
    timestamp: '00:24:51',
    type: 'Security Downgrade (Open Network)',
    severity: 'FLAGGED',
    score: 25,
    description: 'Transmitter advertises open security (no RSN IE) while baseline HomeNet-5G requires WPA2-PSK + PMF encryption.',
  },
  {
    id: 't3',
    deviceId: 'd1',
    ssid: 'HomeNet-5G [Rogue Clone]',
    bssid: 'AABBCC001199',
    timestamp: '00:24:52',
    type: 'Channel Mismatch Anomaly',
    severity: 'WATCHING',
    score: 15,
    description: 'Rogue beacon operating on Channel 11 while legitimate network is anchored to Channel 6.',
  },
  {
    id: 't4',
    deviceId: 'd1',
    ssid: 'HomeNet-5G [Rogue Clone]',
    bssid: 'AABBCC001199',
    timestamp: '00:24:55',
    type: 'Targeted Deauth Burst against Client',
    severity: 'SUSPICIOUS',
    score: 25,
    description: '5 consecutive deauthentication frames detected targeting station 123456789ABC from rogue BSSID within 20ms.',
  },
  {
    id: 't5',
    deviceId: 'd1',
    ssid: 'HomeNet-5G [Rogue Clone]',
    bssid: 'AABBCC001199',
    timestamp: '00:24:56',
    type: 'EAPOL 4-Way Handshake Intercepted',
    severity: 'FLAGGED',
    score: 30,
    description: 'EAPOL key exchange frames captured following forced client disconnect. High probability of offline dictionary cracking attempt.',
  },
  {
    id: 't6',
    deviceId: 'd2',
    ssid: 'KarmaNet',
    bssid: 'EEFF00112233',
    timestamp: '00:24:45',
    type: 'Multi-SSID Probe Trap Triggered',
    severity: 'SUSPICIOUS',
    score: 30,
    description: 'BSSID EEFF00112233 answered probe requests for multiple distinct network names (HomeNet-5G, OfficeWiFi, AndroidAP).',
  },
  {
    id: 't7',
    deviceId: 'd2',
    ssid: 'KarmaNet',
    bssid: 'EEFF00112233',
    timestamp: '00:24:46',
    type: 'Untrusted SSID Response Pattern',
    severity: 'SUSPICIOUS',
    score: 20,
    description: 'Rogue AP generated synthetic probe responses for unconfigured external network names.',
  },
  {
    id: 't8',
    deviceId: 'd8',
    ssid: 'BLE Tracking Beacon',
    bssid: 'EE1122334455',
    timestamp: '00:24:58',
    type: 'Wi-Fi + BLE Cross-Correlation',
    severity: 'WATCHING',
    score: 20,
    description: 'BLE advertisement signal strength (+18 dBm gain) moving in lockstep with rogue Wi-Fi AP signal, indicating physical approach.',
  },
  {
    id: 't9',
    deviceId: 'd6',
    ssid: 'HomeNet-5G [Base AP]',
    bssid: 'AABBCC001122',
    timestamp: '00:24:00',
    type: 'Trusted Baseline Initialized',
    severity: 'UNKNOWN',
    score: 0,
    description: 'Legitimate access point verified on Channel 6 with WPA2-PSK + PMF parameters.',
  },
  {
    id: 't10',
    deviceId: 'd7',
    ssid: 'Client Station',
    bssid: '123456789ABC',
    timestamp: '00:24:02',
    type: 'Client Station Registered',
    severity: 'UNKNOWN',
    score: 0,
    description: 'Authorized station transmitting probe requests on Channel 6.',
  },
];

export const proximityDevices: ProximityDevice[] = [
  { id: 'd1', ssid: 'HomeNet-5G', state: 'FLAGGED', x: 50, y: 38, rssiA: -44, rssiB: -56 },
  { id: 'd2', ssid: 'KarmaNet', state: 'SUSPICIOUS', x: 28, y: 72, rssiA: -68, rssiB: -72 },
  { id: 'd3', ssid: 'Free_Cafe_WiFi', state: 'UNKNOWN', x: 76, y: 28, rssiA: -72, rssiB: -64 },
  { id: 'd4', ssid: 'NETGEAR-Office', state: 'UNKNOWN', x: 75, y: 55, rssiA: -78, rssiB: -50 },
  { id: 'd5', ssid: 'AndroidAP', state: 'UNKNOWN', x: 55, y: 80, rssiA: -74, rssiB: -58 },
  { id: 'd6', ssid: 'HomeNet-5G (Trusted)', state: 'UNKNOWN', x: 45, y: 40, rssiA: -38, rssiB: -42 },
  { id: 'd7', ssid: 'Client Station', state: 'UNKNOWN', x: 38, y: 50, rssiA: -50, rssiB: -58 },
  { id: 'd8', ssid: 'BLE Tracking Beacon', state: 'WATCHING', x: 52, y: 35, rssiA: -60, rssiB: -62 },
];

export const framesPerSecHistory = Array.from({ length: 60 }, (_, i) => ({
  t: i,
  nodeA: 15 + Math.sin(i * 0.3) * 5 + Math.random() * 2,
  nodeB: 12 + Math.cos(i * 0.25) * 4 + Math.random() * 2,
}));
