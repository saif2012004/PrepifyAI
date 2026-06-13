import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { syncService } from '../services/syncService';

/**
 * When the app regains network or returns to foreground, upload queued practice attempts.
 * Requires the user to be signed in (token present) — push endpoint returns 401 otherwise.
 */
export function useOfflineSyncOnReconnect(isAuthenticated: boolean) {
  const flushing = useRef(false);

  const tryFlush = async () => {
    if (!isAuthenticated || flushing.current) return;
    const n = await syncService.getPendingCount();
    if (n === 0) return;
    flushing.current = true;
    try {
      await syncService.flushPendingAttempts();
    } catch {
      /* keep queue; user can retry from Profile */
    } finally {
      flushing.current = false;
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void tryFlush();
      }
    });

    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') void tryFlush();
    };
    const sub = AppState.addEventListener('change', onAppState);

    void tryFlush();

    return () => {
      unsubNet();
      sub.remove();
    };
  }, [isAuthenticated]);
}
