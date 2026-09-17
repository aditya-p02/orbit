import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

interface UsePollingOptions {
  interval?: number;
  enabled?: boolean;
  onError?: (error: Error) => void;
}

export function usePolling<T>(
  fetcher: () => Promise<T>,
  options: UsePollingOptions = {}
) {
  const { interval = 5000, enabled = true, onError } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
      onError?.(err as Error);
    } finally {
      setLoading(false);
    }
  }, [fetcher, onError]);

  useEffect(() => {
    if (!enabled) return;
    
    fetchData();
    const timer = setInterval(fetchData, interval);
    return () => clearInterval(timer);
  }, [enabled, interval, fetchData]);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch };
}

export function useDevices() {
  return usePolling(() => api.getDevices(), { interval: 3000 });
}

export function useAlerts() {
  return usePolling(() => api.getAlerts(), { interval: 3000 });
}

export function useHealth() {
  return usePolling(() => api.getHealth(), { interval: 5000 });
}

export function useObservations() {
  return usePolling(() => api.getObservations(), { interval: 5000 });
}

export function useWhitelist() {
  return usePolling(() => api.getWhitelist(), { interval: 10000 });
}