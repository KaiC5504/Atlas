import { Wifi, WifiOff, RefreshCw, AlertCircle, Loader2, Clock } from 'lucide-react';
import type { ConnectionState } from '../../types/friends';

interface ConnectionStatusProps {
  connectionState: ConnectionState;
  lastSyncTime: number | null;
  pendingActionsCount: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncNow: () => void;
  isLoading?: boolean;
}

export function ConnectionStatus({
  connectionState,
  lastSyncTime,
  pendingActionsCount,
  onConnect,
  onDisconnect,
  onSyncNow,
  isLoading = false,
}: ConnectionStatusProps) {
  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return 'Never';

    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'text-green-400';
      case 'connecting':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = () => {
    switch (connectionState) {
      case 'connected':
        return <Wifi className="w-4 h-4" />;
      case 'connecting':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <WifiOff className="w-4 h-4" />;
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className={`flex items-center gap-2 ${getStatusColor()}`}>
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>

        {/* Last sync time */}
        {connectionState === 'connected' && lastSyncTime && (
          <div className="flex items-center gap-1 text-gray-400 text-xs">
            <Clock className="w-3 h-3" />
            <span>Synced {formatLastSync(lastSyncTime)}</span>
          </div>
        )}

        {/* Pending actions badge */}
        {pendingActionsCount > 0 && (
          <div className="flex items-center gap-1 text-yellow-400 text-xs bg-yellow-400/10 px-2 py-0.5 rounded">
            <span>{pendingActionsCount} pending</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {connectionState === 'connected' && (
          <button
            onClick={onSyncNow}
            disabled={isLoading}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            title="Sync now"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}

        {connectionState === 'connected' ? (
          <button
            onClick={onDisconnect}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={connectionState === 'connecting'}
            className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
          >
            {connectionState === 'connecting' ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}

export default ConnectionStatus;
