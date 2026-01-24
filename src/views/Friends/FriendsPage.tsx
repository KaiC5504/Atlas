import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Heart,
  Home,
  Image,
  Gamepad2,
  Calendar,
  Users,
  Loader2,
  AlertCircle,
  UserPlus,
  Settings,
  Trash2,
  Check,
  X,
  Pencil,
} from 'lucide-react';
import { useFriends } from '../../hooks/useFriends';
import { usePartnerPresence } from '../../hooks/usePartnerPresence';
import { PartnerOverview } from './PartnerOverview';
import { MemoriesTab } from './MemoriesTab';
import { GamingTab } from './GamingTab';
import { CalendarTab } from './CalendarTab';
import { FriendsListTab } from './FriendsListTab';
import { SetupWizard } from './SetupWizard';
import { ConnectionStatus } from '../../components/friends/ConnectionStatus';

type TabId = 'overview' | 'memories' | 'gaming' | 'calendar' | 'friends';

const TABS: { id: TabId; label: string; icon: React.ReactNode; partnerOnly?: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: <Home className="w-4 h-4" /> },
  { id: 'memories', label: 'Memories', icon: <Image className="w-4 h-4" />, partnerOnly: true },
  { id: 'gaming', label: 'Gaming', icon: <Gamepad2 className="w-4 h-4" /> },
  { id: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" />, partnerOnly: true },
  { id: 'friends', label: 'Friends', icon: <Users className="w-4 h-4" /> },
];

export default function FriendsPage() {
  const {
    localUser,
    friends,
    partner,
    isLoading,
    isConnected,
    connectionState,
    lastSyncTime,
    pendingActionsCount,
    error,
    loadLocalUser,
    loadFriends,
    setFriendCode,
    setUsername,
    createDemoData,
    clearAllData,
    connectToServer,
    disconnectFromServer,
    syncNow,
  } = useFriends();

  const { startPolling, stopPolling, setActiveTab: setPresenceActiveTab } = usePartnerPresence();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showSetup, setShowSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [editedCode, setEditedCode] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const hasAutoConnected = useRef(false);
  const isMounted = useRef(true);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if user needs setup
  const needsSetup = !localUser?.id || !localUser?.username;

  // Delayed loading indicator - only show spinner after 200ms to prevent flash
  useEffect(() => {
    if (isLoading) {
      loadingTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
          setShowLoadingIndicator(true);
        }
      }, 200);
    } else {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setShowLoadingIndicator(false);
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [isLoading]);

  useEffect(() => {
    if (needsSetup && !isLoading) {
      setShowSetup(true);
    }
  }, [needsSetup, isLoading]);

  // Start polling when connected and update based on tab
  useEffect(() => {
    if (isConnected) {
      const isOnPartnerTab = activeTab === 'overview' || activeTab === 'memories' || activeTab === 'calendar';
      setPresenceActiveTab(isOnPartnerTab);
      startPolling(isOnPartnerTab);
    }

    return () => {
      stopPolling();
    };
    // Only re-run when connection status or active tab changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, activeTab]);

  // Track mount state for cleanup
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Auto-connect on mount if user has auth token (only once)
  // Wait for initial load to complete so we have accurate connection state from backend
  useEffect(() => {
    if (
      !isLoading && // Wait for initial load to complete
      localUser?.auth_token &&
      !isConnected &&
      connectionState === 'disconnected' &&
      !hasAutoConnected.current
    ) {
      hasAutoConnected.current = true;
      connectToServer().catch(() => {
        // Silent fail - user can manually connect
        // Reset flag so user can try again if they navigate away and back
        if (isMounted.current) {
          hasAutoConnected.current = false;
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, localUser?.auth_token, isConnected, connectionState]);

  // Filter tabs based on partner status
  const availableTabs = TABS.filter((tab) => !tab.partnerOnly || partner);

  const handleSetupComplete = async (username: string) => {
    await setUsername(username);
    setShowSetup(false);
    await loadLocalUser();
    await loadFriends();
  };

  const handleCreateDemo = async () => {
    await createDemoData();
    setShowSetup(false);
  };

  const handleClearData = async () => {
    if (window.confirm('Are you sure you want to clear all friends data? This cannot be undone.')) {
      await clearAllData();
      setShowSetup(true);
    }
  };

  const handleStartEditCode = () => {
    setEditedCode(localUser?.friend_code || '');
    setIsEditingCode(true);
    setTimeout(() => codeInputRef.current?.focus(), 0);
  };

  const handleSaveCode = async () => {
    if (editedCode.trim()) {
      await setFriendCode(editedCode.trim());
    }
    setIsEditingCode(false);
  };

  const handleCancelEdit = () => {
    setIsEditingCode(false);
    setEditedCode('');
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveCode();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await syncNow();
    } finally {
      setIsSyncing(false);
    }
  };

  // Only show loading spinner after delay to prevent flash for quick loads
  // But don't render content while loading (prevents incomplete UI flash)
  if (isLoading) {
    if (showLoadingIndicator) {
      return (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      );
    }
    // During initial load delay, render nothing to prevent flash
    return null;
  }

  if (showSetup) {
    return (
      <SetupWizard
        onComplete={handleSetupComplete}
        onCreateDemo={handleCreateDemo}
        existingUser={localUser}
      />
    );
  }

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Heart className="w-6 h-6 text-pink-400" />
            {partner ? 'Partner' : 'Friends'}
          </h1>
          <p className="text-text-secondary mt-1">
            {partner
              ? 'Stay connected with your special person'
              : 'Connect with friends and share your gaming journey'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!partner && (
            <button
              onClick={() => setActiveTab('friends')}
              className="btn btn-primary flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Add Partner
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn btn-ghost p-2"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-red-400">{error}</div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="glass-elevated rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-medium text-text-primary mb-3">Settings</h3>

          {/* Connection Status */}
          {localUser?.auth_token && (
            <ConnectionStatus
              connectionState={connectionState}
              lastSyncTime={lastSyncTime}
              pendingActionsCount={pendingActionsCount}
              onConnect={connectToServer}
              onDisconnect={disconnectFromServer}
              onSyncNow={handleSyncNow}
              isLoading={isSyncing}
            />
          )}

          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm text-text-primary mb-1">Your Friend Code</div>
              {isEditingCode ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={codeInputRef}
                    type="text"
                    value={editedCode}
                    onChange={(e) => setEditedCode(e.target.value)}
                    onKeyDown={handleCodeKeyDown}
                    className="input font-mono text-lg max-w-[200px]"
                    placeholder="Enter your code"
                    maxLength={32}
                  />
                  <button
                    onClick={handleSaveCode}
                    className="btn btn-primary p-2"
                    title="Save"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="btn btn-ghost p-2"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-mono text-indigo-400">
                    {localUser?.friend_code || 'Not set'}
                  </span>
                  <button
                    onClick={handleStartEditCode}
                    className="btn btn-ghost p-1.5"
                    title="Edit friend code"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleClearData}
              className="btn btn-danger text-sm"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear Data
            </button>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 glass-elevated rounded-xl">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'overview' && (
          <PartnerOverview
            partner={partner}
            friends={friends}
            onAddPartner={() => setActiveTab('friends')}
          />
        )}
        {activeTab === 'memories' && partner && <MemoriesTab />}
        {activeTab === 'gaming' && <GamingTab partner={partner} />}
        {activeTab === 'calendar' && partner && <CalendarTab />}
        {activeTab === 'friends' && (
          <FriendsListTab
            friends={friends}
            localUser={localUser}
            onRefresh={loadFriends}
          />
        )}
      </div>
    </div>
  );
}
