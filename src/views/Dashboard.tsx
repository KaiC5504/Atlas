// Dashboard view - overview, recent activity, quick actions
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import type { Download, AudioDetectionJob, SystemStatus, ServerConfig } from '../types';
import {
  LayoutDashboard,
  Download as DownloadIcon,
  BrainCircuit,
  Gamepad2,
  Server,
  ArrowRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Plus,
  Sparkles,
  Activity,
  HardDrive,
  Cpu,
  RefreshCw,
} from 'lucide-react';

interface QuickStat {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [detectionJobs, setDetectionJobs] = useState<AudioDetectionJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Server status state
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [serverStatus, setServerStatus] = useState<SystemStatus | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);

  useEffect(() => {
    fetchData();
    fetchServerInfo();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [downloadList, jobList] = await Promise.all([
        invoke<Download[]>('list_downloads').catch(() => []),
        invoke<AudioDetectionJob[]>('list_audio_detection_jobs').catch(() => []),
      ]);
      setDownloads(downloadList);
      setDetectionJobs(jobList);
    } finally {
      setLoading(false);
    }
  }

  async function fetchServerInfo() {
    try {
      const [config, hasCreds] = await Promise.all([
        invoke<ServerConfig>('get_server_config').catch(() => null),
        invoke<boolean>('has_ssh_credentials').catch(() => false),
      ]);
      setServerConfig(config);
      setHasCredentials(hasCreds);

      // If we have credentials, try to fetch status
      if (hasCreds) {
        fetchServerStatus();
      }
    } catch (err) {
      console.error('Failed to fetch server info:', err);
    }
  }

  async function fetchServerStatus() {
    try {
      setServerLoading(true);
      const status = await invoke<SystemStatus>('get_system_status', {});
      setServerStatus(status);
    } catch (err) {
      console.error('Failed to fetch server status:', err);
    } finally {
      setServerLoading(false);
    }
  }

  const stats: QuickStat[] = [
    {
      label: 'Total Downloads',
      value: downloads.length,
      icon: <DownloadIcon size={20} />,
      color: 'text-accent-primary',
    },
    {
      label: 'Completed',
      value: downloads.filter(d => d.status === 'completed').length,
      icon: <CheckCircle size={20} />,
      color: 'text-green-400',
    },
    {
      label: 'ML Jobs',
      value: detectionJobs.length,
      icon: <BrainCircuit size={20} />,
      color: 'text-purple-400',
    },
    {
      label: 'Processing',
      value: detectionJobs.filter(j => j.status === 'processing').length,
      icon: <Loader2 size={20} />,
      color: 'text-amber-400',
    },
  ];

  const recentDownloads = downloads.slice(0, 3);
  const recentJobs = detectionJobs.slice(0, 3);

  const quickActions = [
    {
      label: 'Add Download',
      description: 'Download from YouTube',
      icon: <DownloadIcon size={24} />,
      color: 'bg-accent-primary/20 text-accent-primary',
      onClick: () => navigate('/downloads'),
    },
    {
      label: 'Audio Detection',
      description: 'Detect audio segments',
      icon: <BrainCircuit size={24} />,
      color: 'bg-purple-500/20 text-purple-400',
      onClick: () => navigate('/ml-processor'),
    },
    {
      label: 'Valorant Store',
      description: 'Check daily rotation',
      icon: <Gamepad2 size={24} />,
      color: 'bg-red-500/20 text-red-400',
      onClick: () => navigate('/valorant'),
    },
    {
      label: 'Server Monitor',
      description: 'SSH terminal & status',
      icon: <Server size={24} />,
      color: 'bg-cyan-500/20 text-cyan-400',
      onClick: () => navigate('/server'),
    },
  ];

  function getStatusIcon(status: string) {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} className="text-green-400" />;
      case 'downloading':
      case 'processing':
        return <Loader2 size={14} className="text-blue-400 animate-spin" />;
      case 'failed':
        return <AlertCircle size={14} className="text-red-400" />;
      default:
        return <Clock size={14} className="text-text-muted" />;
    }
  }

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-lg bg-accent-primary/20">
          <LayoutDashboard className="w-6 h-6 text-accent-primary" />
        </div>
        <div>
          <h1 className="section-title mb-0">Dashboard</h1>
          <p className="text-sm text-text-muted">Welcome to Atlas</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((stat, idx) => (
          <div key={idx} className="card animate-slide-up" style={{ animationDelay: `${idx * 50}ms` }}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {loading ? '-' : stat.value}
                </p>
                <p className="text-xs text-text-muted">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Quick Actions */}
        <div className="col-span-1">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Sparkles size={18} className="text-text-muted" />
            Quick Actions
          </h2>
          <div className="space-y-3">
            {quickActions.map((action, idx) => (
              <button
                key={idx}
                onClick={action.onClick}
                className="w-full card p-4 text-left hover:bg-glass-bg-hover transition-all duration-200 group"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${action.color}`}>
                    {action.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white group-hover:text-accent-primary transition-colors">
                      {action.label}
                    </h3>
                    <p className="text-xs text-text-muted">{action.description}</p>
                  </div>
                  <ArrowRight size={16} className="text-text-muted group-hover:text-white transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Downloads */}
        <div className="col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <DownloadIcon size={18} className="text-text-muted" />
              Recent Downloads
            </h2>
            <button
              onClick={() => navigate('/downloads')}
              className="text-xs text-text-muted hover:text-white transition-colors"
            >
              View all
            </button>
          </div>
          <div className="card">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-accent-primary" />
              </div>
            ) : recentDownloads.length === 0 ? (
              <div className="text-center py-8">
                <DownloadIcon size={32} className="mx-auto text-text-muted opacity-50 mb-2" />
                <p className="text-sm text-text-muted">No downloads yet</p>
                <button
                  onClick={() => navigate('/downloads')}
                  className="mt-3 text-xs text-accent-primary hover:underline flex items-center gap-1 mx-auto"
                >
                  <Plus size={12} />
                  Add one
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentDownloads.map((download) => (
                  <div
                    key={download.id}
                    className="flex items-center gap-3 p-2 rounded-lg glass-subtle"
                  >
                    {getStatusIcon(download.status)}
                    <span className="text-sm text-white truncate flex-1">
                      {download.title || 'Untitled'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent ML Jobs */}
        <div className="col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <BrainCircuit size={18} className="text-text-muted" />
              Recent Jobs
            </h2>
            <button
              onClick={() => navigate('/ml-processor')}
              className="text-xs text-text-muted hover:text-white transition-colors"
            >
              View all
            </button>
          </div>
          <div className="card">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-purple-400" />
              </div>
            ) : recentJobs.length === 0 ? (
              <div className="text-center py-8">
                <BrainCircuit size={32} className="mx-auto text-text-muted opacity-50 mb-2" />
                <p className="text-sm text-text-muted">No ML jobs yet</p>
                <button
                  onClick={() => navigate('/ml-processor')}
                  className="mt-3 text-xs text-purple-400 hover:underline flex items-center gap-1 mx-auto"
                >
                  <Plus size={12} />
                  Submit one
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 p-2 rounded-lg glass-subtle"
                  >
                    {getStatusIcon(job.status)}
                    <span className="text-sm text-white truncate flex-1">
                      {job.input_file.split(/[/\\]/).pop() || 'Unknown'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Server Status Card */}
      {serverConfig && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Server size={18} className="text-cyan-400" />
              Server Status
              <span className="text-sm font-normal text-text-muted">
                ({serverConfig.host})
              </span>
            </h2>
            {hasCredentials && (
              <button
                onClick={fetchServerStatus}
                disabled={serverLoading}
                className="btn btn-sm btn-ghost"
              >
                <RefreshCw size={14} className={serverLoading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
          <div className="card">
            {!hasCredentials ? (
              <div className="text-center py-6">
                <Server size={32} className="mx-auto text-text-muted opacity-50 mb-2" />
                <p className="text-sm text-text-muted mb-3">Not connected</p>
                <button
                  onClick={() => navigate('/server')}
                  className="btn btn-sm btn-primary"
                >
                  Connect
                </button>
              </div>
            ) : serverLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={24} className="animate-spin text-cyan-400" />
              </div>
            ) : serverStatus ? (
              <div className="grid grid-cols-4 gap-4">
                <div className="p-3 rounded-lg glass-subtle">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={14} className="text-text-muted" />
                    <span className="text-xs text-text-muted">Uptime</span>
                  </div>
                  <p className="text-sm font-medium text-white">{serverStatus.uptime}</p>
                </div>
                <div className="p-3 rounded-lg glass-subtle">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity size={14} className="text-text-muted" />
                    <span className="text-xs text-text-muted">Load</span>
                  </div>
                  <p className="text-sm font-medium text-white">{serverStatus.load_average}</p>
                </div>
                <div className="p-3 rounded-lg glass-subtle">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu size={14} className="text-text-muted" />
                    <span className="text-xs text-text-muted">Memory</span>
                  </div>
                  <p className="text-sm font-medium text-white">
                    {serverStatus.memory_used} / {serverStatus.memory_total}
                  </p>
                </div>
                <div className="p-3 rounded-lg glass-subtle">
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive size={14} className="text-text-muted" />
                    <span className="text-xs text-text-muted">Disk</span>
                  </div>
                  <p className="text-sm font-medium text-white">
                    {serverStatus.disk_used} / {serverStatus.disk_total}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <AlertCircle size={32} className="mx-auto text-text-muted opacity-50 mb-2" />
                <p className="text-sm text-text-muted">Could not fetch status</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
