// Settings view - app configuration
import { useState, useEffect } from 'react';
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
} from 'lucide-react';

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

  useEffect(() => {
    fetchSettings();
  }, []);

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
          {/* Download Settings */}
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
                <input
                  type="text"
                  value={downloadPath}
                  onChange={(e) => setDownloadPath(e.target.value)}
                  disabled={saving}
                  className="input"
                  placeholder="/path/to/downloads"
                />
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

          {/* ML Settings */}
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

          {/* Developer Settings */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Code size={18} className="text-cyan-400" />
              <h2 className="card-title mb-0">Developer Settings</h2>
            </div>
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
