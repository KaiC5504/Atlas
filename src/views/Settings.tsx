// Settings view - app configuration
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Settings as SettingsType, UpdateSettingsParams } from '../types';
import {
  Settings as SettingsIcon,
  Download,
  BrainCircuit,
  Gamepad2,
  FolderOpen,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Hash,
  Code,
  ToggleLeft,
  ToggleRight,
  GripVertical,
  MessageSquare,
  Info,
  Monitor,
} from 'lucide-react';
import { DraggableNavList } from '../components/DraggableNavList';
import { useNavigationSettingsContext } from '../contexts';

// Type for download path validation result
interface DownloadPathValidation {
  valid: boolean;
  resolved_path: string;
  exists: boolean;
  is_special_folder: boolean;
  message: string;
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [downloadPath, setDownloadPath] = useState('');
  const [defaultQuality, setDefaultQuality] = useState('best');
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(3);
  const [maxConcurrentMLJobs, setMaxConcurrentMLJobs] = useState(1);
  const [atlasProjectPath, setAtlasProjectPath] = useState('');
  const [remoteUpdatePath, setRemoteUpdatePath] = useState('');
  const [updateUrlBase, setUpdateUrlBase] = useState('');

  // Path validation state
  const [pathValidation, setPathValidation] = useState<DownloadPathValidation | null>(null);
  const [validatingPath, setValidatingPath] = useState(false);

  // Discord state
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordConnected, setDiscordConnected] = useState(false);
  const [discordConnecting, setDiscordConnecting] = useState(false);

  // Startup & Tray state
  const [runOnStartup, setRunOnStartup] = useState(false);
  const [closeToTray, setCloseToTray] = useState(false);

  const {
    developerModeEnabled,
    orderedItems,
    hiddenItems,
    toggleDeveloperMode,
    reorderItems,
    toggleItemVisibility,
  } = useNavigationSettingsContext();

  useEffect(() => {
    fetchSettings();
  }, []);

  // Validate download path with debounce
  const validatePath = useCallback(async (path: string) => {
    setValidatingPath(true);
    try {
      const result = await invoke<DownloadPathValidation>('validate_download_path', { path });
      setPathValidation(result);
    } catch (err) {
      setPathValidation({
        valid: false,
        resolved_path: '',
        exists: false,
        is_special_folder: false,
        message: `Validation error: ${err}`,
      });
    } finally {
      setValidatingPath(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      validatePath(downloadPath);
    }, 300); // Debounce 300ms

    return () => clearTimeout(timer);
  }, [downloadPath, validatePath]);

  async function fetchSettings() {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<SettingsType>('get_settings');
      setSettings(result);
      setDownloadPath(result.download_path);
      setDefaultQuality(result.default_quality);
      setMaxConcurrentDownloads(result.max_concurrent_downloads);
      setMaxConcurrentMLJobs(result.max_concurrent_ml_jobs);
      setAtlasProjectPath(result.atlas_project_path || '');
      setRemoteUpdatePath(result.remote_update_path || '');
      setUpdateUrlBase(result.update_url_base || '');
      setDiscordEnabled(result.discord_rich_presence_enabled);
      setRunOnStartup(result.run_on_startup);
      setCloseToTray(result.close_to_tray);

      // Check Discord connection status
      const connected = await invoke<boolean>('is_discord_connected');
      setDiscordConnected(connected);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);
      const params: UpdateSettingsParams = {
        download_path: downloadPath,
        default_quality: defaultQuality,
        max_concurrent_downloads: maxConcurrentDownloads,
        max_concurrent_ml_jobs: maxConcurrentMLJobs,
        atlas_project_path: atlasProjectPath,
        remote_update_path: remoteUpdatePath,
        update_url_base: updateUrlBase,
        discord_rich_presence_enabled: discordEnabled,
      };
      await invoke('update_settings', { settings: params });
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      fetchSettings();
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscordToggle() {
    const newEnabled = !discordEnabled;
    setDiscordEnabled(newEnabled);

    if (newEnabled) {
      // Try to connect when enabling
      setDiscordConnecting(true);
      try {
        await invoke('connect_discord');
        setDiscordConnected(true);
        setMessage({ type: 'success', text: 'Discord Rich Presence connected!' });
      } catch (err) {
        setMessage({ type: 'error', text: `Discord connection failed: ${err}` });
        setDiscordConnected(false);
        setDiscordEnabled(false); // Revert toggle on failure
        return;
      } finally {
        setDiscordConnecting(false);
      }
    } else {
      // Disconnect when disabling
      try {
        await invoke('disconnect_discord');
        setDiscordConnected(false);
      } catch (err) {
        console.error('Failed to disconnect Discord:', err);
      }
    }

    // Save the setting
    await invoke('update_settings', {
      settings: { discord_rich_presence_enabled: newEnabled },
    });
  }

  async function handleRunOnStartupToggle() {
    const newEnabled = !runOnStartup;
    setRunOnStartup(newEnabled);
    try {
      if (newEnabled) {
        await invoke('enable_autostart');
      } else {
        await invoke('disable_autostart');
      }
      await invoke('update_settings', { settings: { run_on_startup: newEnabled } });
    } catch (err) {
      setRunOnStartup(!newEnabled); // Revert on failure
      setMessage({ type: 'error', text: `Failed to toggle run on startup: ${err}` });
    }
  }

  async function handleCloseToTrayToggle() {
    const newEnabled = !closeToTray;
    setCloseToTray(newEnabled);
    await invoke('update_settings', { settings: { close_to_tray: newEnabled } });
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-lg bg-white/10">
          <SettingsIcon className="w-6 h-6 text-text-secondary" />
        </div>
        <div>
          <h1 className="section-title mb-0">Settings</h1>
          <p className="text-sm text-text-muted">Configure your preferences</p>
        </div>
      </div>

      {loading && (
        <div className="card flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-accent-primary" />
        </div>
      )}

      {error && (
        <div className="card bg-red-500/10 border-red-500/20 text-red-400 flex items-center gap-3 mb-6">
          <AlertCircle size={20} />
          <span>Error: {error}</span>
        </div>
      )}

      {!loading && !error && (
        <form onSubmit={handleSave} className="space-y-6">
          {developerModeEnabled && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Download size={18} className="text-accent-primary" />
                <h2 className="card-title mb-0">Download Settings</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    <FolderOpen size={14} className="inline mr-2" />
                    Download Path
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={downloadPath}
                      onChange={(e) => setDownloadPath(e.target.value)}
                      disabled={saving}
                      className={`input pr-10 ${
                        pathValidation
                          ? pathValidation.valid
                            ? 'border-green-500/30 focus:border-green-500/50'
                            : 'border-red-500/30 focus:border-red-500/50'
                          : ''
                      }`}
                      placeholder="Downloads"
                    />
                    {validatingPath && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 size={16} className="animate-spin text-text-muted" />
                      </div>
                    )}
                    {!validatingPath && pathValidation && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {pathValidation.valid ? (
                          <CheckCircle size={16} className="text-green-400" />
                        ) : (
                          <AlertCircle size={16} className="text-red-400" />
                        )}
                      </div>
                    )}
                  </div>
                  {/* Path validation feedback */}
                  {pathValidation && (
                    <div className={`mt-2 text-xs ${pathValidation.valid ? 'text-text-muted' : 'text-red-400'}`}>
                      <div className="flex items-start gap-1.5">
                        <Info size={12} className="mt-0.5 shrink-0" />
                        <div>
                          <div>{pathValidation.message}</div>
                          {pathValidation.valid && pathValidation.resolved_path && (
                            <div className="text-text-muted/70 mt-0.5 break-all">
                              {pathValidation.resolved_path}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-text-muted mt-1">
                    Tip: Use "Downloads", "Desktop", "Documents", "Videos" for quick access to Windows folders
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Default Quality
                    </label>
                    <select
                      value={defaultQuality}
                      onChange={(e) => setDefaultQuality(e.target.value)}
                      disabled={saving}
                      className="select"
                    >
                      <option value="best">Best Quality</option>
                      <option value="1080p">1080p</option>
                      <option value="720p">720p</option>
                      <option value="480p">480p</option>
                      <option value="audio_only">Audio Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      <Hash size={14} className="inline mr-2" />
                      Max Concurrent Downloads
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={maxConcurrentDownloads}
                      onChange={(e) => setMaxConcurrentDownloads(parseInt(e.target.value) || 1)}
                      disabled={saving}
                      className="input"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {developerModeEnabled && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <BrainCircuit size={18} className="text-purple-400" />
                <h2 className="card-title mb-0">ML Settings</h2>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  <Hash size={14} className="inline mr-2" />
                  Max Concurrent ML Jobs
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={maxConcurrentMLJobs}
                  onChange={(e) => setMaxConcurrentMLJobs(parseInt(e.target.value) || 1)}
                  disabled={saving}
                  className="input max-w-xs"
                />
                <p className="text-xs text-text-muted mt-1">
                  ML jobs are resource-intensive. Keep this low for stability.
                </p>
              </div>
            </div>
          )}

          {/* Valorant Settings */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Gamepad2 size={18} className="text-red-400" />
              <h2 className="card-title mb-0">Valorant</h2>
            </div>
            <div className="p-3 rounded-lg glass-subtle">
              {settings?.valorant_credentials?.has_credentials ? (
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle size={16} />
                  <span>Logged in as: {settings.valorant_credentials.username}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-text-muted">
                  <AlertCircle size={16} />
                  <span>No credentials set. Login via Valorant Tracker page.</span>
                </div>
              )}
            </div>
          </div>

          {/* Discord Integration */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={18} className="text-indigo-400" />
              <h2 className="card-title mb-0">Discord Integration</h2>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-text-secondary">
                  Rich Presence
                </label>
                <p className="text-xs text-text-muted mt-0.5">
                  Show gaming status on your Discord profile
                </p>
              </div>
              <div className="flex items-center gap-3">
                {discordConnecting && (
                  <Loader2 size={16} className="animate-spin text-text-muted" />
                )}
                {discordEnabled && discordConnected && (
                  <span className="text-xs text-green-400">Connected</span>
                )}
                <button
                  type="button"
                  onClick={handleDiscordToggle}
                  disabled={saving || discordConnecting}
                  className={`
                    p-1 rounded-lg transition-colors
                    ${discordEnabled
                      ? 'text-indigo-400 hover:text-indigo-300'
                      : 'text-text-muted hover:text-text-secondary'
                    }
                  `}
                >
                  {discordEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>
            </div>
          </div>

          {/* Startup & Tray Behavior */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Monitor size={18} className="text-indigo-400" />
              <h2 className="card-title mb-0">Startup & Tray</h2>
            </div>

            {/* Run on Startup Toggle */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary">
                  Run on Startup
                </label>
                <p className="text-xs text-text-muted mt-0.5">
                  Automatically start Atlas when Windows starts (minimized to tray)
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunOnStartupToggle}
                disabled={saving}
                className={`
                  p-1 rounded-lg transition-colors
                  ${runOnStartup
                    ? 'text-indigo-400 hover:text-indigo-300'
                    : 'text-text-muted hover:text-text-secondary'
                  }
                `}
              >
                {runOnStartup ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>

            {/* Close to Tray Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-text-secondary">
                  Close to Tray
                </label>
                <p className="text-xs text-text-muted mt-0.5">
                  Minimize to system tray instead of closing when clicking X
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseToTrayToggle}
                disabled={saving}
                className={`
                  p-1 rounded-lg transition-colors
                  ${closeToTray
                    ? 'text-indigo-400 hover:text-indigo-300'
                    : 'text-text-muted hover:text-text-secondary'
                  }
                `}
              >
                {closeToTray ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>
          </div>

          {/* Customization */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Code size={18} className="text-cyan-400" />
              <h2 className="card-title mb-0">Customization</h2>
            </div>

            {/* Sidebar Order */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-text-secondary mb-2">
                <GripVertical size={14} className="inline mr-2" />
                Sidebar Order
              </label>
              <p className="text-xs text-text-muted mb-3">
                Drag items to reorder the sidebar navigation
              </p>
              <DraggableNavList
                items={orderedItems}
                hiddenItems={hiddenItems}
                onReorder={reorderItems}
                onToggleVisibility={toggleItemVisibility}
                disabled={saving}
              />
            </div>

            {/* Developer Mode Toggle */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <label className="block text-sm font-medium text-text-secondary">
                  Developer Mode
                </label>
                <p className="text-xs text-text-muted mt-0.5">
                  Show advanced tools in sidebar (Dashboard, Downloads, ML Processor, Server)
                </p>
              </div>
              <button
                type="button"
                onClick={toggleDeveloperMode}
                disabled={saving}
                className={`
                  p-1 rounded-lg transition-colors
                  ${developerModeEnabled
                    ? 'text-cyan-400 hover:text-cyan-300'
                    : 'text-text-muted hover:text-text-secondary'
                  }
                `}
              >
                {developerModeEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>

            {developerModeEnabled && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    <FolderOpen size={14} className="inline mr-2" />
                    Atlas Project Path
                  </label>
                  <input
                    type="text"
                    value={atlasProjectPath}
                    onChange={(e) => setAtlasProjectPath(e.target.value)}
                    disabled={saving}
                    className="input"
                    placeholder="E:\tools\Kai Chuan\Projects\Atlas"
                  />
                  <p className="text-xs text-text-muted mt-1">
                    Path to the Atlas project folder. Used for auto-detecting build files when deploying updates.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    <FolderOpen size={14} className="inline mr-2" />
                    Remote Update Path
                  </label>
                  <input
                    type="text"
                    value={remoteUpdatePath}
                    onChange={(e) => setRemoteUpdatePath(e.target.value)}
                    disabled={saving}
                    className="input"
                    placeholder="/var/www/updates.example.com/atlas"
                  />
                  <p className="text-xs text-text-muted mt-1">
                    Remote server path where update files are uploaded via SFTP.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    <FolderOpen size={14} className="inline mr-2" />
                    Update URL Base
                  </label>
                  <input
                    type="text"
                    value={updateUrlBase}
                    onChange={(e) => setUpdateUrlBase(e.target.value)}
                    disabled={saving}
                    className="input"
                    placeholder="https://updates.example.com/atlas"
                  />
                  <p className="text-xs text-text-muted mt-1">
                    Public URL base for update files. Used for update.json verification.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save Settings
                </>
              )}
            </button>
            {message && (
              <div
                className={`flex items-center gap-2 text-sm ${
                  message.type === 'success' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                {message.text}
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
