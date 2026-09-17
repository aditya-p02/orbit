export function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  });
}

export function formatUptime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function getStateConfig(state: string) {
  switch (state) {
    case 'Flagged':
      return { 
        bg: 'bg-danger-bg', 
        text: 'text-danger', 
        border: 'border-danger-border',
        dot: 'bg-danger',
        label: 'FLAGGED'
      };
    case 'Suspicious':
      return { 
        bg: 'bg-warning-bg', 
        text: 'text-warning', 
        border: 'border-warning-border',
        dot: 'bg-warning',
        label: 'SUSPICIOUS'
      };
    case 'Watching':
      return { 
        bg: 'bg-info-bg', 
        text: 'text-info', 
        border: 'border-info-border',
        dot: 'bg-info',
        label: 'WATCHING'
      };
    default:
      return { 
        bg: 'bg-gray-500/10', 
        text: 'text-text-dim', 
        border: 'border-gray-500/20',
        dot: 'bg-gray-500',
        label: 'UNKNOWN'
      };
  }
}

export function getScoreColor(score: number): string {
  if (score >= 70) return 'text-danger';
  if (score >= 40) return 'text-warning';
  if (score >= 20) return 'text-info';
  return 'text-text-dim';
}

export function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-danger-bg';
  if (score >= 40) return 'bg-warning-bg';
  if (score >= 20) return 'bg-info-bg';
  return 'bg-gray-500/10';
}

export function truncateMac(mac: string, length = 8): string {
  if (mac.length <= length) return mac;
  return mac.slice(0, length) + '…';
}

export function formatMac(mac: string): string {
  return mac.replace(/([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/, '$1:$2:$3:$4:$5:$6').toUpperCase();
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}