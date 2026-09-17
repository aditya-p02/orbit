import { useState } from 'react';
import { Wifi, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { classNames } from '../utils/helpers';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('orbit2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.login(username, password);
      onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary-bg flex items-center justify-center mx-auto mb-4">
              <Wifi className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-text mb-2">ORBIT</h1>
            <p className="text-text-muted">Wi-Fi/BLE Intrusion Detection System</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-danger-bg border border-danger-border rounded-xl flex items-center gap-3 text-danger">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                disabled={loading}
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={classNames(
                'w-full py-3 px-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2',
                loading
                  ? 'bg-primary/50 text-primary/70 cursor-not-allowed'
                  : 'bg-primary text-bg hover:bg-primary-hover'
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-xs text-text-dim">
              Demo credentials: <code className="font-mono text-text-muted">admin</code> / <code className="font-mono text-text-muted">orbit2026</code>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-text-dim mt-6">
          ORBIT IDS Dashboard v1.0 · Stage 3
        </p>
      </div>
    </div>
  );
}