// ValorantTracker view - check store, view history, manage authentication
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ValorantStore, AuthStatus } from '../types';
import {
  Gamepad2,
  RefreshCw,
  LogIn,
  LogOut,
  ShoppingBag,
  Calendar,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Shield,
  X,
  History,
  Sparkles,
} from 'lucide-react';

export function ValorantTracker() {
  const [currentStore, setCurrentStore] = useState<ValorantStore | null>(null);
  const [history, setHistory] = useState<ValorantStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefreshing, setAutoRefreshing] = useState(false);

  // Auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    // Load initial data
    fetchStoreData();
    fetchHistory();
    fetchAuthStatus();

    // Check if we should auto-refresh (once per store rotation)
    checkAutoRefresh();

    const unlistenSuccess = listen('riot-auth-success', () => {
      setIsLoggingIn(false);
      fetchAuthStatus();
      handleCheckStore();
    });

    const unlistenError = listen<string>('riot-auth-error', (event) => {
      setIsLoggingIn(false);
      setError(`Authentication failed: ${event.payload}`);
    });

    return () => {
      unlistenSuccess.then(fn => fn());
      unlistenError.then(fn => fn());
    };
  }, []);

  async function fetchAuthStatus() {
    try {
      const status = await invoke<AuthStatus>('get_auth_status');
      setAuthStatus(status);
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
    }
  }

  async function checkAutoRefresh() {
    try {
      const shouldRefresh = await invoke<boolean>('should_auto_refresh_store');
      if (shouldRefresh) {
        console.log('Auto-refreshing store (new rotation detected)');
        setAutoRefreshing(true);
        // Wait for auth status to load first
        const status = await invoke<AuthStatus>('get_auth_status');
        if (status?.is_authenticated) {
          await invoke<ValorantStore>('check_valorant_store', {
            region: status.region || 'ap'
          }).then(result => {
            setCurrentStore(result);
            fetchHistory();
          }).catch(err => {
            console.error('Auto-refresh failed:', err);
          });
        }
        setAutoRefreshing(false);
      }
    } catch (err) {
      console.error('Failed to check auto-refresh:', err);
      setAutoRefreshing(false);
    }
  }

  async function fetchStoreData() {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<ValorantStore | null>('get_valorant_store');
      setCurrentStore(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistory() {
    try {
      const result = await invoke<ValorantStore[]>('get_store_history', { limit: 10 });
      setHistory(result);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }

  async function handleCheckStore() {
    try {
      setChecking(true);
      setError(null);
      const result = await invoke<ValorantStore>('check_valorant_store', {
        region: authStatus?.region || 'ap'
      });
      setCurrentStore(result);
      fetchHistory();
    } catch (err) {
      setError(String(err));
    } finally {
      setChecking(false);
    }
  }

  async function handleLogin() {
    try {
      setIsLoggingIn(true);
      setError(null);
      await invoke('open_auth_window');
    } catch (err) {
      setError(String(err));
      setIsLoggingIn(false);
    }
  }

  async function handleCaptureCredentials() {
    try {
      const success = await invoke<boolean>('capture_auth_cookies');
      if (success) {
        setIsLoggingIn(false);
        fetchAuthStatus();
        handleCheckStore();
      }
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleLogout() {
    try {
      await invoke('logout');
      setAuthStatus(null);
      fetchAuthStatus();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/20">
            <Gamepad2 className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="section-title mb-0">Valorant Tracker</h1>
            <p className="text-sm text-text-muted">Check your daily store rotation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckStore}
            disabled={checking}
            className="btn btn-primary"
          >
            {checking ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <ShoppingBag size={16} />
                Check Store
              </>
            )}
          </button>
          <button
            onClick={fetchStoreData}
            disabled={loading}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Auth Status Card */}
      <div className={`card mb-6 ${authStatus?.is_authenticated ? 'border-green-500/30' : 'border-amber-500/30'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {authStatus?.is_authenticated ? (
              <>
                <div className="p-2 rounded-lg bg-green-500/20">
                  <Shield className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white flex items-center gap-2">
                    Logged In
                    <span className={`badge ${authStatus.has_full_cookies ? 'badge-success' : 'badge-warning'}`}>
                      {authStatus.has_full_cookies ? 'Full Auth' : 'Partial'}
                    </span>
                  </h3>
                  <p className="text-sm text-text-muted">
                    {authStatus.expires_hint && `Valid for ~${authStatus.expires_hint}`}
                    {authStatus.puuid && ` | ${authStatus.puuid.substring(0, 8)}...`}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Not Logged In</h3>
                  <p className="text-sm text-text-muted">Store data will be simulated</p>
                </div>
              </>
            )}
          </div>
          <div>
            {authStatus?.is_authenticated ? (
              <button onClick={handleLogout} className="btn btn-ghost btn-sm">
                <LogOut size={16} />
                Logout
              </button>
            ) : (
              <button onClick={handleLogin} disabled={isLoggingIn} className="btn btn-primary btn-sm">
                {isLoggingIn ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <LogIn size={16} />
                    Login with Riot
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Login in progress dialog */}
        {isLoggingIn && (
          <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 animate-fade-in">
            <p className="text-sm text-blue-400 mb-3">
              Login window is open. After logging in to Riot, click the button below:
            </p>
            <div className="flex gap-2">
              <button onClick={handleCaptureCredentials} className="btn btn-primary btn-sm">
                <CheckCircle size={14} />
                I've logged in - Capture
              </button>
              <button
                onClick={() => invoke('close_auth_window').then(() => setIsLoggingIn(false))}
                className="btn btn-ghost btn-sm"
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="card bg-red-500/10 border-red-500/20 text-red-400 flex items-center gap-3 mb-6">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Current Store */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag size={20} className="text-text-secondary" />
          <h2 className="text-lg font-semibold text-white">Today's Store</h2>
          {currentStore?.is_real_data === true && (
            <span className="badge badge-success">Real Data</span>
          )}
          {currentStore?.is_real_data === false && (
            <span className="badge badge-warning">Mock Data</span>
          )}
        </div>

        {(loading || autoRefreshing) && (
          <div className="card flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={32} className="animate-spin text-red-400" />
              {autoRefreshing && (
                <span className="text-sm text-text-muted">Auto-refreshing store...</span>
              )}
            </div>
          </div>
        )}

        {!loading && !autoRefreshing && !currentStore && (
          <div className="card empty-state">
            <ShoppingBag className="empty-state-icon" />
            <h3 className="empty-state-title">No store data</h3>
            <p className="empty-state-description">
              Click "Check Store" to fetch your daily rotation
            </p>
          </div>
        )}

        {currentStore && (
          <div className="card">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
              <div className="flex items-center gap-4 text-sm text-text-muted">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {currentStore.date}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {new Date(currentStore.checked_at).toLocaleTimeString()}
                </span>
              </div>
              <span className="text-sm text-text-muted">{currentStore.items.length} items</span>
            </div>

            {currentStore.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle size={48} className="text-amber-400 mb-4" />
                <p className="text-lg font-medium text-amber-400 mb-2">Check Failed</p>
                <p className="text-sm text-text-muted">
                  {currentStore.is_real_data === false
                    ? "Authentication failed or cookies expired. Please login again."
                    : "No items in store"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {currentStore.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="glass rounded-lg p-4 transition-all duration-200 hover:bg-glass-bg-hover animate-slide-up"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className="flex gap-4">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-20 h-16 object-contain rounded"
                        />
                      ) : (
                        <div className="w-20 h-16 rounded bg-white/5 flex items-center justify-center">
                          <Sparkles size={24} className="text-text-muted" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white truncate mb-1">{item.name}</h4>
                        <p className="text-lg font-bold text-accent-primary">
                          {item.price.toLocaleString()} VP
                        </p>
                        <p className="text-xs text-text-muted capitalize">{item.item_type}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Store History */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <History size={20} className="text-text-secondary" />
          <h2 className="text-lg font-semibold text-white">Store History</h2>
        </div>

        {history.length === 0 ? (
          <div className="card empty-state py-8">
            <History className="w-12 h-12 text-text-muted mb-3 opacity-50" />
            <p className="text-sm text-text-muted">No history yet</p>
          </div>
        ) : (
          <div className="card">
            <div className="space-y-2">
              {history.map((store, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg glass-subtle hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Calendar size={16} className="text-text-muted" />
                    <span className="font-medium text-white">{store.date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-muted">{store.items.length} items</span>
                    {store.is_real_data === true && (
                      <span className="badge badge-success text-xs">real</span>
                    )}
                    {store.is_real_data === false && (
                      <span className="badge badge-warning text-xs">mock</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
