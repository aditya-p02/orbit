import { useState, useEffect, useCallback, useRef } from 'react';
import Login from './components/Login';
import Overview from './components/Overview';
import Devices from './components/Devices';
import Alerts from './components/Alerts';
import Nodes from './components/Nodes';
import Proximity from './components/Proximity';
import Timeline from './components/Timeline';

type Tab = 'overview' | 'devices' | 'alerts' | 'nodes' | 'proximity' | 'timeline';

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'devices', label: 'Devices' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'nodes', label: 'Nodes' },
  { id: 'proximity', label: 'Proximity' },
  { id: 'timeline', label: 'Timeline' },
];

function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (tab: Tab) => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const commands = [
    { label: 'Open Overview', tab: 'overview' as Tab, icon: '◉' },
    { label: 'Open Devices', tab: 'devices' as Tab, icon: '⌾' },
    { label: 'Open Alerts', tab: 'alerts' as Tab, icon: '◈' },
    { label: 'Open Nodes', tab: 'nodes' as Tab, icon: '◎' },
    { label: 'Open Proximity', tab: 'proximity' as Tab, icon: '◐' },
    { label: 'Open Timeline', tab: 'timeline' as Tab, icon: '◷' },
    { label: 'Filter Flagged Devices', tab: 'devices' as Tab, icon: '⚑' },
    { label: 'Show Live Nodes', tab: 'nodes' as Tab, icon: '●' },
  ];

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        className="relative bg-card rounded-2xl card-shadow-lg border border-border/60 w-full max-w-lg overflow-hidden animate-slide-in-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-border/60">
          <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands, devices, alerts…"
            className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered[0]) {
                onNavigate(filtered[0].tab);
                onClose();
              }
            }}
          />
          <kbd className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border font-mono">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-2">
          {filtered.map((cmd, i) => (
            <button
              key={i}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left transition-colors"
              onClick={() => { onNavigate(cmd.tab); onClose(); }}
            >
              <span className="text-primary text-base w-5 text-center flex-shrink-0">{cmd.icon}</span>
              <span className="text-sm text-foreground">{cmd.label}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-border/60 px-4 py-2.5 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span><kbd className="bg-muted px-1 py-0.5 rounded border border-border font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="bg-muted px-1 py-0.5 rounded border border-border font-mono">↵</kbd> select</span>
          <span><kbd className="bg-muted px-1 py-0.5 rounded border border-border font-mono">ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="flex items-center gap-3 bg-card border border-border/60 card-shadow-lg rounded-2xl px-4 py-3 animate-slide-in-up pointer-events-auto">
      <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot flex-shrink-0" />
      <span className="text-sm text-foreground">{message}</span>
    </div>
  );
}

function OrbitLogo() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-7 h-7 flex-shrink-0">
        <svg viewBox="0 0 28 28" width="28" height="28">
          <circle cx="14" cy="14" r="3.5" fill="#6366F1" />
          <ellipse cx="14" cy="14" rx="12" ry="5" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeDasharray="0" opacity="0.4" transform="rotate(-30 14 14)" />
          <ellipse cx="14" cy="14" rx="12" ry="5" fill="none" stroke="#6366F1" strokeWidth="1.5" opacity="0.2" transform="rotate(30 14 14)" />
          <circle cx="22" cy="10" r="1.5" fill="#06B6D4" />
          <circle cx="8" cy="20" r="1" fill="#06B6D4" opacity="0.7" />
        </svg>
      </div>
      <span className="text-base font-bold tracking-tight text-foreground">ORBIT</span>
    </div>
  );
}

const API_BASE = '';

export default function App() {
  const [user, setUser] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [alertBadge, setAlertBadge] = useState(2);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Auth check - always runs
  useEffect(() => {
    checkAuth();
  }, []);

  // Command palette keyboard shortcut - always runs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Update tab indicator - always runs
  useEffect(() => {
    if (!tabsRef.current) return;
    const container = tabsRef.current;
    const activeBtn = container.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement;
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
  }, [activeTab]);

  const checkAuth = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.username);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  const handleAuth = async (username: string) => {
    setUser(username);
    return true;
  };

  const navigate = useCallback((tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'alerts') {
      setAlertBadge(0);
      setSelectedDevice(null);
    }
  }, []);

  // Loading state
  if (!authChecked) {
    return (
      <div className="orbit-ground flex h-screen items-center justify-center">
        <div className="flex h-12 w-12 animate-spin rounded-full border-4 border-[color:var(--color-phosphor)] border-t-transparent" />
      </div>
    );
  }

  // Login state
  if (!user) {
    return <Login onAuth={handleAuth} />;
  }

  // Main app
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border/60 card-shadow">
        <div className="px-4 sm:px-6 h-14 flex items-center gap-4">
          {/* Logo */}
          <div className="flex-shrink-0">
            <OrbitLogo />
          </div>

          {/* Tabs */}
          <nav className="hidden md:flex items-center flex-1 justify-center relative" ref={tabsRef}>
            {/* Sliding indicator */}
            <div
              className="absolute inset-y-0 rounded-xl bg-secondary transition-all duration-200 ease-out pointer-events-none"
              style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
            />
            {tabs.map(tab => (
              <button
                key={tab.id}
                data-tab={tab.id}
                onClick={() => navigate(tab.id)}
                className={`relative px-3.5 py-1.5 text-sm font-medium rounded-xl transition-colors duration-150 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                {tab.id === 'alerts' && alertBadge > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-status-flagged text-white text-[9px] font-bold">
                    {alertBadge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto md:ml-0">
            {/* Node status */}
            <div className="hidden lg:flex items-center gap-2 text-xs">
              {['Node A', 'Node B'].map(name => (
                <div key={name} className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse-dot" />
                  <span className="font-medium">{name}</span>
                </div>
              ))}
            </div>

            {/* Search / command palette */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-2 bg-muted hover:bg-muted/80 text-muted-foreground text-xs px-3 py-1.5 rounded-xl border border-border transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline bg-card text-muted-foreground px-1 py-0.5 rounded border border-border font-mono text-[10px]">⌘K</kbd>
            </button>

            {/* Notifications */}
            <button
              onClick={() => navigate('alerts')}
              className="relative p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {alertBadge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-status-flagged text-white text-[9px] font-bold flex items-center justify-center">
                  {alertBadge}
                </span>
              )}
            </button>

            {/* User */}
            <div className="w-7 h-7 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
              {user?.charAt(0).toUpperCase() || 'A'}
            </div>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="md:hidden flex overflow-x-auto border-t border-border/60 px-4 py-2 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap flex-shrink-0 transition-colors ${
                activeTab === tab.id
                  ? 'bg-secondary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto w-full">
          {activeTab === 'overview' && (
            <Overview />
          )}
          {activeTab === 'devices' && (
            <Devices selectedDevice={selectedDevice} onSelectDevice={setSelectedDevice} />
          )}
          {activeTab === 'alerts' && (
            <Alerts selectedDevice={selectedDevice} onClearDeviceFilter={() => setSelectedDevice(null)} />
          )}
          {activeTab === 'nodes' && <Nodes />}
          {activeTab === 'proximity' && (
            <Proximity selectedDevice={selectedDevice} onSelectDevice={setSelectedDevice} />
          )}
          {activeTab === 'timeline' && (
            <Timeline selectedDevice={selectedDevice} />
          )}
        </div>
      </main>

      {/* Command palette */}
      {commandPaletteOpen && (
        <CommandPalette
          onClose={() => setCommandPaletteOpen(false)}
          onNavigate={navigate}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <Toast
            key={t.id}
            message={t.message}
            onDismiss={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
          />
        ))}
      </div>
    </div>
  );
}