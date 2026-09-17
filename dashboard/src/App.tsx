import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DevicesTab } from './components/DevicesTab';
import { AlertsTab } from './components/AlertsTab';
import { TimelineTab } from './components/TimelineTab';
import { WhitelistTab } from './components/WhitelistTab';
import { HealthTab } from './components/HealthTab';
import { LoginPage } from './components/LoginPage';
import { useDevices, useAlerts, useHealth, useObservations, useWhitelist } from './hooks/usePolling';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './utils/api';

function Dashboard() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('devices');
  
  const { data: devices, refetch: refetchDevices } = useDevices();
  const { data: alerts, refetch: refetchAlerts } = useAlerts();
  const { data: health, refetch: refetchHealth } = useHealth();
  const { data: observations, refetch: refetchObs } = useObservations();
  const { refetch: refetchWhitelist } = useWhitelist();

  const handleAlertResolve = useCallback(async (id: number) => {
    try {
      await api.resolveAlert(id);
      refetchAlerts();
      refetchDevices();
      refetchHealth();
    } catch (e) {
      console.error('Failed to resolve alert:', e);
    }
  }, [refetchAlerts, refetchDevices, refetchHealth]);

  const handleWhitelistChange = useCallback(() => {
    refetchWhitelist();
    refetchDevices();
    refetchAlerts();
  }, [refetchWhitelist, refetchDevices, refetchAlerts]);

  const { connected: wsConnected } = useWebSocket((msg) => {
    if (msg.type === 'alert') {
      refetchAlerts();
      refetchDevices();
      refetchHealth();
    } else if (msg.type === 'device_update') {
      refetchDevices();
    } else if (msg.type === 'node_status') {
      refetchHealth();
    } else if (msg.type === 'timeline_event') {
      refetchObs();
    }
  });

  const tabs = [
    { id: 'devices', label: 'Devices', content: <DevicesTab devices={devices ?? []} wsConnected={wsConnected} /> },
    { id: 'alerts', label: 'Alerts', content: <AlertsTab alerts={alerts ?? []} onResolve={handleAlertResolve} /> },
    { id: 'timeline', label: 'Timeline', content: <TimelineTab observations={observations ?? []} /> },
    { id: 'whitelist', label: 'Whitelist', content: <WhitelistTab onRefresh={handleWhitelistChange} /> },
    { id: 'health', label: 'Health', content: <HealthTab health={health ?? null} /> },
  ];

  const currentTab = tabs.find(t => t.id === activeTab);

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={async () => {
          await api.logout();
          window.location.href = '/login';
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <Header
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        wsConnected={wsConnected}
      />
      <main
        className="pt-16 transition-all duration-300"
        style={{
          marginLeft: sidebarCollapsed ? '64px' : '256px',
          width: sidebarCollapsed ? 'calc(100% - 64px)' : 'calc(100% - 256px)',
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        {currentTab?.content}
      </main>
    </div>
  );
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Check if already logged in
    api.getDevices()
      .then(() => setLoggedIn(true))
      .catch(() => setLoggedIn(false))
      .finally(() => setCheckingAuth(false));
  }, []);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!loggedIn) {
    return <LoginPage onLogin={() => setLoggedIn(true)} />;
  }

  return <Dashboard />;
}

export default App;