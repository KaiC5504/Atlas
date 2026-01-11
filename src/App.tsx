// App.tsx - Main app component with routing + layout
import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { UpdateToast } from './components/UpdateToast';
import { Dashboard } from './views/Dashboard';
import { DownloadQueue } from './views/DownloadQueue';
import { MLProcessor } from './views/MLProcessor';
import { ValorantTracker } from './views/ValorantTracker';
import { ServerMonitor } from './views/ServerMonitor';
import PerformanceMonitor from './views/PerformanceMonitor';
import GamingPerformance from './views/GamingPerformance';
import { Settings } from './views/Settings';
import { useUpdater } from './hooks';
import './App.css';

function App() {
  const { state, checkForUpdate, downloadAndInstall, dismissUpdate } = useUpdater();

  // Check for updates on app startup
  useEffect(() => {
    // Small delay to let the app initialize first
    const timer = setTimeout(() => {
      checkForUpdate();
    }, 2000);

    return () => clearTimeout(timer);
  }, [checkForUpdate]);

  return (
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
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/downloads" element={<DownloadQueue />} />
          <Route path="/ml-processor" element={<MLProcessor />} />
          <Route path="/valorant" element={<ValorantTracker />} />
          <Route path="/server" element={<ServerMonitor />} />
          <Route path="/performance" element={<PerformanceMonitor />} />
          <Route path="/gaming" element={<GamingPerformance />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {/* Update toast notification */}
      <UpdateToast
        state={state}
        onDownload={downloadAndInstall}
        onRestart={downloadAndInstall}
        onDismiss={dismissUpdate}
        onRetry={checkForUpdate}
      />
    </div>
  );
}

export default App;
