import { 
  Wifi, 
  AlertTriangle, 
  List, 
  ShieldCheck, 
  HeartPulse, 
  LogOut, 
  ChevronLeft,
  Settings
} from 'lucide-react';
import { classNames } from '../utils/helpers';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const tabs = [
  { id: 'devices', label: 'Devices', icon: Wifi },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'timeline', label: 'Timeline', icon: List },
  { id: 'whitelist', label: 'Whitelist', icon: ShieldCheck },
  { id: 'health', label: 'Health', icon: HeartPulse },
] as const;

export function Sidebar({ 
  activeTab, 
  setActiveTab, 
  onLogout, 
  collapsed = false,
  onToggleCollapse 
}: SidebarProps) {
  return (
    <aside 
      className={classNames(
        'fixed left-0 top-0 h-screen bg-surface border-r border-border flex flex-col transition-all duration-300 z-40',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center">
              <Wifi className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold text-primary">ORBIT</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center mx-auto">
            <Wifi className="w-5 h-5 text-primary" />
          </div>
        )}
        {onToggleCollapse && !collapsed && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={classNames(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                'relative overflow-hidden',
                isActive
                  ? 'bg-primary-bg text-primary border border-primary/20'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? tab.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!collapsed && <span>{tab.label}</span>}
              {isActive && !collapsed && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        {!collapsed ? (
          <div className="space-y-3">
            <div className="px-3 py-2.5 bg-surface-hover rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center">
                    <Settings className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text">Admin</p>
                    <p className="text-xs text-text-dim">Administrator</p>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className={classNames(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                'text-danger hover:bg-danger-bg hover:border-danger-border border border-transparent',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? 'Logout' : undefined}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-danger hover:bg-danger-bg transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}