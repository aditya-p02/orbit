import { Bell, Search, Menu, Sun, Moon, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { classNames } from '../utils/helpers';

interface HeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  wsConnected: boolean;
}

export function Header({ sidebarCollapsed, onToggleSidebar, wsConnected }: HeaderProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      className={classNames(
        'fixed top-0 right-0 h-16 bg-surface/80 backdrop-blur-md border-b border-border flex items-center justify-between z-30 transition-all duration-300',
        sidebarCollapsed ? 'left-16' : 'left-64'
      )}
      style={{ width: sidebarCollapsed ? 'calc(100% - 64px)' : 'calc(100% - 256px)' }}
    >
      <div className="flex items-center gap-4 px-4" style={{ marginLeft: sidebarCollapsed ? '64px' : '256px' }}>
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors lg:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
          <input
            type="text"
            placeholder="Search devices, alerts..."
            className="w-64 sm:w-80 pl-10 pr-4 py-2 bg-bg border border-border rounded-xl text-sm text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pr-4">
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className={classNames(
              'relative p-2 rounded-lg transition-colors',
              notificationsOpen ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
            )}
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-xs font-medium rounded-full flex items-center justify-center">
              3
            </span>
          </button>
          
          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">Notifications</h3>
                <button className="text-sm text-primary hover:underline">Mark all read</button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <div className="px-4 py-3 text-center text-text-muted text-sm">No new notifications</div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={classNames(
              'flex items-center gap-2 px-3 py-1.5 rounded-xl transition-colors',
              userMenuOpen ? 'bg-surface-hover' : 'hover:bg-surface-hover'
            )}
          >
            <div className="w-8 h-8 rounded-full bg-primary-bg flex items-center justify-center">
              <span className="text-sm font-medium text-primary">A</span>
            </div>
            <span className="text-sm font-medium hidden sm:block">Admin</span>
            <ChevronDown className="w-4 h-4 text-text-muted" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="font-medium">Administrator</p>
                <p className="text-sm text-text-dim">admin@orbit.local</p>
              </div>
              <button className="w-full px-4 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-hover flex items-center gap-2">
                <span>Settings</span>
              </button>
              <button className="w-full px-4 py-2 text-sm text-danger hover:bg-danger-bg flex items-center gap-2">
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

        <div className={classNames(
          'w-2 h-2 rounded-full ml-2 flex-shrink-0',
          wsConnected ? 'bg-success animate-pulse' : 'bg-danger'
        )} title={wsConnected ? 'Real-time connected' : 'Real-time disconnected'} />
      </div>
    </header>
  );
}