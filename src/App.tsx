// App.tsx - Main app component with routing + layout
import { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Sidebar } from './components/Sidebar';
import { UpdateToast } from './components/UpdateToast';
import { FloatingPartnerWidget } from './components/friends';
import { DefaultRouteRedirect } from './components/DefaultRouteRedirect';
import { useErrorLogger } from './hooks/useErrorLogger';
import { Dashboard } from './views/Dashboard';
import { DownloadQueue } from './views/DownloadQueue';
import { MLProcessor } from './views/MLProcessor';
import { ValorantTracker } from './views/ValorantTracker';
import { ServerMonitor } from './views/ServerMonitor';
import PerformanceMonitor from './views/PerformanceMonitor';
import GamingPerformance from './views/GamingPerformance';
import GameLauncher from './views/GameLauncher';
import PlaylistUploader from './views/PlaylistUploader';
import TaskMonitor from './views/TaskMonitor';
import GachaHistory from './views/GachaHistory';
import FriendsPage from './views/Friends';
import { Settings } from './views/Settings';
import { useUpdater } from './hooks';
import { NavigationSettingsProvider } from './contexts';
import './App.css';

function App() {
  // Capture frontend errors and forward to log file
  useErrorLogger();

  const { state, checkForUpdate, downloadUpdate, installUpdate, dismissUpdate } = useUpdater();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if we're on the friends page
  const isFriendsPage = location.pathname === '/friends';

  // Check for updates on app startup
  useEffect(() => {
    // Small delay to let the app initialize first
    const timer = setTimeout(() => {
      checkForUpdate();
    }, 2000);

    return () => clearTimeout(timer);
  }, [checkForUpdate]);

  // Listen for game launch navigation event
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen('launcher:navigate_to_gaming', async () => {
        try {
          // Start performance monitoring and gaming detection
          await invoke('start_performance_monitoring');
          await invoke('start_gaming_detection');
        } catch (e) {
          console.error('Failed to start gaming detection:', e);
        }
        // Navigate to gaming view
        navigate('/gaming');
      });

      return unlisten;
    };

    const promise = setupListener();
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, [navigate]);

  return (
    <NavigationSettingsProvider>
      <div className="flex h-full bg-surface-base">
        {/* Animated background gradient */}
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent rounded-full blur-3xl" />
          <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-purple-500/10 via-transparent to-transparent rounded-full blur-3xl" />
        </div>

        {/* Sidebar navigation */}
        <Sidebar />

        {/* Main content area */}
        <main className="flex-1 p-6 overflow-auto animate-fade-in">
          {/* FriendsPage is always mounted but hidden when not active */}
          {/* This keeps the connection alive and receives updates in the background */}
          <div className={isFriendsPage ? 'h-full' : 'hidden'}>
            <FriendsPage />
          </div>

          {/* Other pages render normally via Routes */}
          {!isFriendsPage && (
            <Routes>
              <Route path="/" element={<DefaultRouteRedirect />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/downloads" element={<DownloadQueue />} />
              <Route path="/ml-processor" element={<MLProcessor />} />
              <Route path="/valorant" element={<ValorantTracker />} />
              <Route path="/server" element={<ServerMonitor />} />
              <Route path="/performance" element={<PerformanceMonitor />} />
              <Route path="/gaming" element={<GamingPerformance />} />
              <Route path="/launcher" element={<GameLauncher />} />
              <Route path="/playlist-uploader" element={<PlaylistUploader />} />
              <Route path="/tasks" element={<TaskMonitor />} />
              <Route path="/gacha" element={<GachaHistory />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          )}
        </main>

        {/* Update toast notification */}
        <UpdateToast
          state={state}
          onDownload={downloadUpdate}
          onInstall={installUpdate}
          onDismiss={dismissUpdate}
          onRetry={checkForUpdate}
        />

        {/* Floating partner widget */}
        <FloatingPartnerWidget />
      </div>
    </NavigationSettingsProvider>
  );
}

export default App;
