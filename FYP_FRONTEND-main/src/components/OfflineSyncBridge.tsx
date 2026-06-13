import { useAuth } from '../context/AuthContext';
import { useOfflineSyncOnReconnect } from '../hooks/useOfflineSyncOnReconnect';

export default function OfflineSyncBridge() {
  const { isAuthenticated } = useAuth();
  useOfflineSyncOnReconnect(isAuthenticated);
  return null;
}
