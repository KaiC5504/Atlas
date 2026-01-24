import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Settings as SettingsType, UpdateSettingsParams } from '../types';
import type { GachaAccount, GachaGame } from '../types/gacha';
import { getGameDisplayName } from '../types/gacha';
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
  Code,
  ToggleLeft,
  ToggleRight,
  GripVertical,
  MessageSquare,
  Info,
  Monitor,
  ListTodo,
  Sparkles,
  User,
  Camera,
  X,
  Heart,
} from 'lucide-react';
import { DraggableNavList } from '../components/DraggableNavList';
import { CustomSelect } from '../components/ui/CustomSelect';
import { ImageCropModal } from '../components/ui/ImageCropModal';
import { useNavigationSettingsContext } from '../contexts';

const QUALITY_OPTIONS = [
  { value: 'best', label: 'Best Quality' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: 'audio_only', label: 'Audio Only' },
];

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

  // Task Monitor state
  const [autoRestoreEnabled, setAutoRestoreEnabled] = useState(false);

  // Gacha Accounts state
  const [gachaAccounts, setGachaAccounts] = useState<GachaAccount[]>([]);
  const [selectedGachaAccounts, setSelectedGachaAccounts] = useState<Record<string, string>>({});

  // User Profile state
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userAvatarBase64, setUserAvatarBase64] = useState<string | null>(null);

  // Partner Widget state
  const [partnerWidgetEnabled, setPartnerWidgetEnabled] = useState(true);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);

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
    }, 300);

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
      setAutoRestoreEnabled(result.auto_restore_enabled);
      setSelectedGachaAccounts(result.selected_gacha_accounts || {});
      setUserDisplayName(result.user_display_name || '');
      setPartnerWidgetEnabled(result.partner_widget_enabled);

      // Load avatar as base64 (bypasses asset protocol issues)
      const avatarBase64 = await invoke<string | null>('get_user_avatar_base64');
      setUserAvatarBase64(avatarBase64);

      // Check Discord connection status
      const connected = await invoke<boolean>('is_discord_connected');
      setDiscordConnected(connected);

      // Load gacha accounts
      const accounts = await invoke<GachaAccount[]>('get_gacha_accounts');
      setGachaAccounts(accounts);
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
        setDiscordEnabled(false); 
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
      setRunOnStartup(!newEnabled); 
      setMessage({ type: 'error', text: `Failed to toggle run on startup: ${err}` });
    }
  }

  async function handleCloseToTrayToggle() {
    const newEnabled = !closeToTray;
    setCloseToTray(newEnabled);
    await invoke('update_settings', { settings: { close_to_tray: newEnabled } });
  }

  async function handleAutoRestoreToggle() {
    const newEnabled = !autoRestoreEnabled;
    setAutoRestoreEnabled(newEnabled);
    await invoke('update_settings', { settings: { auto_restore_enabled: newEnabled } });
  }

  async function handleGachaAccountChange(game: GachaGame, uid: string | null) {
    const updated = { ...selectedGachaAccounts };
    if (uid) {
      updated[game] = uid;
    } else {
      delete updated[game];
    }
    setSelectedGachaAccounts(updated);
    await invoke('update_settings', { settings: { selected_gacha_accounts: updated } });
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be selected again
    e.target.value = '';

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Please select a valid image file (PNG, JPG, GIF, or WebP)' });
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be less than 50MB' });
      return;
    }

    setMessage(null);

    try {
      // Read file as base64
      const base64Full = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      // Show crop modal
      setCropImageSrc(base64Full);
      setShowCropModal(true);
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to read image: ${err}` });
    }
  }

  async function handleCropComplete(croppedBase64: string) {
    setShowCropModal(false);
    setCropImageSrc(null);
    setUploadingAvatar(true);
    setMessage(null);

    try {
      // Show preview immediately
      setAvatarPreview(croppedBase64);

      // Extract base64 data (remove data URL prefix)
      const base64Data = croppedBase64.split(',')[1];

      // Save to backend (cropped images are always JPEG)
      await invoke<string>('save_user_avatar', {
        imageData: base64Data,
        fileExtension: 'jpg',
      });

      // Load the saved avatar as base64
      const avatarBase64 = await invoke<string | null>('get_user_avatar_base64');
      setUserAvatarBase64(avatarBase64);
      setAvatarPreview(null); // Clear preview, use saved base64
      setMessage({ type: 'success', text: 'Avatar saved!' });
    } catch (err) {
      setAvatarPreview(null);
      setMessage({ type: 'error', text: `Failed to save avatar: ${err}` });
    } finally {
      setUploadingAvatar(false);
    }
  }

  function handleCropCancel() {
    setShowCropModal(false);
    setCropImageSrc(null);
  }

  async function handleRemoveAvatar() {
    setUserAvatarBase64(null);
    setAvatarPreview(null);
    await invoke('update_settings', { settings: { user_avatar_path: '' } });
    setMessage({ type: 'success', text: 'Avatar removed' });
  }

  async function handleDisplayNameSave() {
    try {
      // Save to local settings
      await invoke('update_settings', { settings: { user_display_name: userDisplayName } });

      // Also sync to friends server (set_username will update server if registered)
      try {
        await invoke('set_username', { username: userDisplayName });
      } catch (syncErr) {
        // Don't fail if server sync fails - local save still worked
        console.warn('Failed to sync display name to server:', syncErr);
      }

      setMessage({ type: 'success', text: 'Display name saved!' });
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to save display name: ${err}` });
    }
  }

  async function handlePartnerWidgetToggle() {
    const newEnabled = !partnerWidgetEnabled;
    setPartnerWidgetEnabled(newEnabled);
    await invoke('update_settings', { settings: { partner_widget_enabled: newEnabled } });
  }

  // Group gacha accounts by game
  const gachaAccountsByGame = gachaAccounts.reduce((acc, account) => {
    if (!acc[account.game]) {
      acc[account.game] = [];
    }
    acc[account.game].push(account);
    return acc;
  }, {} as Record<GachaGame, GachaAccount[]>);

  // Get all games that have accounts
  const gamesWithAccounts = Object.keys(gachaAccountsByGame) as GachaGame[];

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Image Crop Modal */}
      {showCropModal && cropImageSrc && (
        <ImageCropModal
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

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
          {/* User Profile Section */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <User size={18} className="text-indigo-400" />
              <h2 className="card-title mb-0">Profile</h2>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Your display name syncs to the friends server. Avatar is stored locally.
            </p>

            <div className="flex items-start gap-6">
              {/* Avatar Upload */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative group">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border-2 border-white/10">
                    {avatarPreview || userAvatarBase64 ? (
                      <img
                        src={avatarPreview || userAvatarBase64 || ''}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={32} className="text-text-muted" />
                    )}
                  </div>
                  {uploadingAvatar && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                      <Loader2 size={20} className="animate-spin text-white" />
                    </div>
                  )}
                  {/* Hover overlay */}
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera size={20} className="text-white" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      disabled={uploadingAvatar || saving}
                    />
                  </label>
                </div>
                {(avatarPreview || userAvatarBase64) && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    disabled={saving}
                  >
                    <X size={12} />
                    Remove
                  </button>
                )}
              </div>

              {/* Display Name */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Display Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userDisplayName}
                    onChange={(e) => setUserDisplayName(e.target.value)}
                    placeholder="Enter your display name..."
                    className="input flex-1"
                    maxLength={32}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    onClick={handleDisplayNameSave}
                    disabled={saving || !userDisplayName.trim()}
                    className="btn btn-primary px-4"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  This is how you appear to friends and in shared features
                </p>
              </div>
            </div>
          </div>

          {/* Gacha Accounts Section */}
          {gamesWithAccounts.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={18} className="text-amber-400" />
                <h2 className="card-title mb-0">Gacha Accounts</h2>
              </div>
              <p className="text-xs text-text-muted mb-4">
                Select your default account for each game. Only accounts with synced gacha history are shown.
              </p>
              <div className="space-y-4">
                {gamesWithAccounts.map((game) => {
                  const accounts = gachaAccountsByGame[game];
                  const options = [
                    { value: '', label: 'None selected' },
                    ...accounts.map((acc) => ({
                      value: acc.uid,
                      label: acc.uid,
                    })),
                  ];
                  return (
                    <div key={game}>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        {getGameDisplayName(game)}
                      </label>
                      <CustomSelect
                        value={selectedGachaAccounts[game] || ''}
                        onChange={(value) => handleGachaAccountChange(game, value || null)}
                        disabled={saving}
                        options={options}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {gamesWithAccounts.length === 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={18} className="text-amber-400" />
                <h2 className="card-title mb-0">Gacha Accounts</h2>
              </div>
              <div className="p-3 rounded-lg glass-subtle">
                <div className="flex items-center gap-2 text-text-muted">
                  <AlertCircle size={16} />
                  <span>No gacha accounts found. Sync your history in the Gacha History module first.</span>
                </div>
              </div>
            </div>
          )}

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
                    <CustomSelect
                      value={defaultQuality}
                      onChange={setDefaultQuality}
                      disabled={saving}
                      options={QUALITY_OPTIONS}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Max Concurrent Downloads
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={maxConcurrentDownloads || ''}
                      onChange={(e) => setMaxConcurrentDownloads(parseInt(e.target.value) || 0)}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setMaxConcurrentDownloads(Math.min(10, Math.max(1, val)));
                      }}
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
                  Max Concurrent ML Jobs
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={maxConcurrentMLJobs || ''}
                  onChange={(e) => setMaxConcurrentMLJobs(parseInt(e.target.value) || 0)}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setMaxConcurrentMLJobs(Math.min(5, Math.max(1, val)));
                  }}
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

          {/* Task Monitor */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <ListTodo size={18} className="text-green-400" />
              <h2 className="card-title mb-0">Task Monitor</h2>
            </div>

            {/* Auto-Restore Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-text-secondary">
                  Auto-Restore Processes
                </label>
                <p className="text-xs text-text-muted mt-0.5">
                  Automatically restart killed processes after gaming sessions end
                </p>
              </div>
              <button
                type="button"
                onClick={handleAutoRestoreToggle}
                disabled={saving}
                className={`
                  p-1 rounded-lg transition-colors
                  ${autoRestoreEnabled
                    ? 'text-green-400 hover:text-green-300'
                    : 'text-text-muted hover:text-text-secondary'
                  }
                `}
              >
                {autoRestoreEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
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

            {/* Floating Partner Widget Toggle */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <label className="block text-sm font-medium text-text-secondary">
                  <Heart size={14} className="inline mr-2 text-pink-400" />
                  Floating Partner Widget
                </label>
                <p className="text-xs text-text-muted mt-0.5">
                  Show a draggable avatar widget for quick access to your partner
                </p>
              </div>
              <button
                type="button"
                onClick={handlePartnerWidgetToggle}
                disabled={saving}
                className={`
                  p-1 rounded-lg transition-colors
                  ${partnerWidgetEnabled
                    ? 'text-pink-400 hover:text-pink-300'
                    : 'text-text-muted hover:text-text-secondary'
                  }
                `}
              >
                {partnerWidgetEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
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
