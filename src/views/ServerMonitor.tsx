// Server Monitor view - SSH terminal and quick actions
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ServerConfig,
  QuickAction,
  CommandResult,
  SSHOutputEvent,
  SSHCompleteEvent,
  TerminalLine,
  SystemStatus,
  UpdateReleaseStep,
  UploadProgressEvent,
  Settings,
} from '../types';
import {
  Server,
  Terminal,
  Trash2,
  Loader2,
  AlertCircle,
  Lock,
  Unlock,
  RefreshCw,
  Clock,
  HardDrive,
  Cpu,
  Activity,
  Box,
  FileText,
  AlertTriangle,
  ScrollText,
  RotateCcw,
  Key,
  Eye,
  EyeOff,
  Send,
  Upload,
  Rocket,
  CheckCircle,
  Circle,
  Play,
} from 'lucide-react';

// Icon mapping for quick actions
const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Terminal,
  Clock,
  HardDrive,
  Cpu,
  Activity,
  Server,
  RotateCcw,
  Box,
  FileText,
  AlertTriangle,
  ScrollText,
};

export function ServerMonitor() {
  // State
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth state
  const [hasCredentials, setHasCredentials] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savePassword, setSavePassword] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Terminal state
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // System status
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Update Release state
  const [showUpdateRelease, setShowUpdateRelease] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releaseSignature, setReleaseSignature] = useState('');
  const [releaseStep, setReleaseStep] = useState<UpdateReleaseStep>('idle');
  const [releaseProgress, setReleaseProgress] = useState(0);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [installerExists, setInstallerExists] = useState<boolean | null>(null);
  const [atlasProjectPath, setAtlasProjectPath] = useState<string | null>(null);
  const [remoteUpdatePath, setRemoteUpdatePath] = useState<string | null>(null);
  const [updateUrlBase, setUpdateUrlBase] = useState<string | null>(null);

  // Computed paths based on settings
  const LOCAL_BUILD_PATH = atlasProjectPath
    ? `${atlasProjectPath}\\src-tauri\\target\\release\\bundle\\nsis`
    : null;

  // Auto-fetch signature when version changes
  useEffect(() => {
    if (!releaseVersion || !/^\d+\.\d+\.\d+$/.test(releaseVersion) || !LOCAL_BUILD_PATH) {
      setReleaseSignature('');
      setInstallerExists(null);
      return;
    }

    const fetchSignature = async () => {
      setSignatureLoading(true);
      try {
        const sigPath = `${LOCAL_BUILD_PATH}\\Atlas_${releaseVersion}_x64-setup.exe.sig`;
        const exePath = `${LOCAL_BUILD_PATH}\\Atlas_${releaseVersion}_x64-setup.exe`;

        // Check if installer exists
        const exists = await invoke<boolean>('check_local_file_exists', { filePath: exePath });
        setInstallerExists(exists);

        if (!exists) {
          setReleaseSignature('');
          return;
        }

        // Read signature file
        const signature = await invoke<string>('read_local_file', { filePath: sigPath });
        setReleaseSignature(signature.trim());
      } catch (err) {
        // Signature file doesn't exist yet - that's okay
        setReleaseSignature('');
      } finally {
        setSignatureLoading(false);
      }
    };

    fetchSignature();
  }, [releaseVersion, LOCAL_BUILD_PATH]);

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, []);

  // Auto-fetch system status when user has credentials on initial load
  useEffect(() => {
    if (hasCredentials && !loading && !systemStatus) {
      fetchSystemStatus();
    }
  }, [hasCredentials, loading]);

  // Set up SSH event listeners
  useEffect(() => {
    let cancelled = false;
    let unlistenOutput: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;
    let unlistenUploadProgress: (() => void) | null = null;

    const setupListeners = async () => {
      const outputUnlisten = await listen<SSHOutputEvent>('ssh:output', (event) => {
        if (cancelled) return;
        const { output, is_stderr } = event.payload;
        addTerminalLine(output, is_stderr);
      });

      const completeUnlisten = await listen<SSHCompleteEvent>('ssh:complete', (event) => {
        if (cancelled) return;
        const { exit_code, error } = event.payload;
        setIsExecuting(false);
        if (error) {
          addTerminalLine(`Error: ${error}`, true);
        }
        // Only show exit code if command failed
        if (exit_code !== 0) {
          addTerminalLine(`Process exited with code ${exit_code}`, true);
        }
      });

      const uploadProgressUnlisten = await listen<UploadProgressEvent>('upload:progress', (event) => {
        if (cancelled) return;
        const { percent } = event.payload;
        setReleaseProgress(percent);
      });

      // If cleanup already ran while we were awaiting, unlisten immediately
      if (cancelled) {
        outputUnlisten();
        completeUnlisten();
        uploadProgressUnlisten();
      } else {
        unlistenOutput = outputUnlisten;
        unlistenComplete = completeUnlisten;
        unlistenUploadProgress = uploadProgressUnlisten;
      }
    };

    setupListeners();

    return () => {
      cancelled = true;
      unlistenOutput?.();
      unlistenComplete?.();
      unlistenUploadProgress?.();
    };
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const [config, actions, hasCreds, settings] = await Promise.all([
        invoke<ServerConfig>('get_server_config'),
        invoke<QuickAction[]>('get_quick_actions'),
        invoke<boolean>('has_ssh_credentials'),
        invoke<Settings>('get_settings'),
      ]);

      setServerConfig(config);
      setQuickActions(actions);
      setHasCredentials(hasCreds);
      setAtlasProjectPath(settings.atlas_project_path);
      setRemoteUpdatePath(settings.remote_update_path);
      setUpdateUrlBase(settings.update_url_base);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function addTerminalLine(text: string, isStderr: boolean, isCommand?: boolean) {
    setTerminalLines((prev) => [
      ...prev,
      { text, isStderr, isCommand, timestamp: new Date() },
    ]);
  }

  async function handleLogin() {
    if (!password) {
      setAuthError('Please enter a password');
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError(null);

      // Test connection
      const success = await invoke<boolean>('test_ssh_connection', { password });

      if (success) {
        if (savePassword) {
          await invoke('save_ssh_credentials', { password });
          setHasCredentials(true);
        }
        addTerminalLine(`Connected to ${serverConfig?.username}@${serverConfig?.host}`, false);

        // Fetch system status after login
        fetchSystemStatus(password);
      } else {
        setAuthError('Connection failed. Check your password.');
      }
    } catch (err) {
      setAuthError(String(err));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await invoke('clear_ssh_credentials');
      setHasCredentials(false);
      setPassword('');
      setTerminalLines([]);
      setSystemStatus(null);
      addTerminalLine('Logged out', false);
    } catch (err) {
      setError(String(err));
    }
  }

  async function fetchSystemStatus(pwd?: string) {
    try {
      setStatusLoading(true);
      const status = await invoke<SystemStatus>('get_system_status', {
        password: pwd || undefined,
      });
      setSystemStatus(status);
    } catch (err) {
      // Silently fail - status is optional
      console.error('Failed to fetch system status:', err);
    } finally {
      setStatusLoading(false);
    }
  }

  async function executeCommand(command: string) {
    if (!command.trim() || isExecuting) return;

    try {
      setIsExecuting(true);
      addTerminalLine(`$ ${command}`, false, true);

      const result = await invoke<CommandResult>('execute_ssh_command', {
        command,
        password: hasCredentials ? undefined : password || undefined,
      });

      // Output is streamed via events, but add final result if not empty
      if (result.output && !result.output.trim()) {
        // Already handled by events
      }

    } catch (err) {
      addTerminalLine(`Error: ${err}`, true);
      setIsExecuting(false);
    }
  }

  function handleCommandSubmit(e: React.FormEvent) {
    e.preventDefault();
    executeCommand(currentCommand);
    setCurrentCommand('');
  }

  function handleQuickAction(action: QuickAction) {
    executeCommand(action.command);
  }

  function clearTerminal() {
    setTerminalLines([]);
  }

  async function deployUpdateRelease() {
    if (!releaseVersion || !releaseSignature) {
      setReleaseError('Version and signature are required');
      return;
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) {
      setReleaseError('Invalid version format. Use X.X.X (e.g., 1.1.0)');
      return;
    }

    if (!LOCAL_BUILD_PATH) {
      setReleaseError('Atlas project path not configured. Set it in Settings.');
      return;
    }

    if (!remoteUpdatePath) {
      setReleaseError('Remote update path not configured. Set it in Settings.');
      return;
    }

    if (!updateUrlBase) {
      setReleaseError('Update URL base not configured. Set it in Settings.');
      return;
    }

    try {
      setReleaseError(null);
      setReleaseStep('uploading');
      setReleaseProgress(0);

      const localFile = `${LOCAL_BUILD_PATH}\\Atlas_${releaseVersion}_x64-setup.exe`;
      const remoteFile = `${remoteUpdatePath}/Atlas_${releaseVersion}_x64-setup.exe`;

      addTerminalLine(`[Update Release] Starting deployment of v${releaseVersion}...`, false, true);

      // Step 1: Upload installer via SFTP
      addTerminalLine(`[Step 1/4] Uploading installer...`, false);
      try {
        await invoke('upload_file_to_server', {
          localPath: localFile,
          remotePath: remoteFile,
        });
        addTerminalLine(`[Step 1/4] Upload complete!`, false);
      } catch (err) {
        throw new Error(`Upload failed: ${err}`);
      }

      // Step 2: Update update.json
      setReleaseStep('updating_json');
      setReleaseProgress(0);
      addTerminalLine(`[Step 2/4] Updating update.json...`, false);

      const pubDate = new Date().toISOString();
      const notes = releaseNotes || 'Bug fixes and performance improvements';
      const updateJson = JSON.stringify({
        version: releaseVersion,
        notes: notes,
        pub_date: pubDate,
        platforms: {
          'windows-x86_64': {
            url: `${updateUrlBase}/Atlas_${releaseVersion}_x64-setup.exe`,
            signature: releaseSignature,
          },
        },
      });

      // Escape the JSON for shell command
      const escapedJson = updateJson.replace(/'/g, "'\\''");
      const updateJsonCommand = `echo '${escapedJson}' > ${remoteUpdatePath}/update.json`;

      try {
        const result = await invoke<CommandResult>('execute_ssh_command', {
          command: updateJsonCommand,
        });
        if (result.exit_code !== 0) {
          throw new Error(result.error || 'Failed to update update.json');
        }
        addTerminalLine(`[Step 2/4] update.json updated!`, false);
      } catch (err) {
        throw new Error(`Update JSON failed: ${err}`);
      }

      // Step 3: Set ownership
      setReleaseStep('setting_ownership');
      addTerminalLine(`[Step 3/4] Setting ownership...`, false);

      try {
        const result = await invoke<CommandResult>('execute_ssh_command', {
          command: `chown www-data:www-data ${remoteUpdatePath}/update.json`,
        });
        if (result.exit_code !== 0) {
          throw new Error(result.error || 'Failed to set ownership');
        }
        addTerminalLine(`[Step 3/4] Ownership set!`, false);
      } catch (err) {
        throw new Error(`Set ownership failed: ${err}`);
      }

      // Step 4: Verify
      setReleaseStep('verifying');
      addTerminalLine(`[Step 4/4] Verifying deployment...`, false);

      try {
        // Verify update.json
        const jsonResult = await invoke<CommandResult>('execute_ssh_command', {
          command: `curl -s ${updateUrlBase}/update.json | grep '"version":"${releaseVersion}"'`,
        });
        if (jsonResult.exit_code !== 0) {
          throw new Error('update.json verification failed - version mismatch');
        }

        // Verify installer is accessible
        const exeResult = await invoke<CommandResult>('execute_ssh_command', {
          command: `curl -s -o /dev/null -w "%{http_code}" ${updateUrlBase}/Atlas_${releaseVersion}_x64-setup.exe`,
        });
        if (exeResult.output.trim() !== '200') {
          throw new Error(`Installer not accessible - HTTP ${exeResult.output.trim()}`);
        }

        addTerminalLine(`[Step 4/4] Verification successful!`, false);
      } catch (err) {
        throw new Error(`Verification failed: ${err}`);
      }

      // Success!
      setReleaseStep('completed');
      addTerminalLine(`[Update Release] v${releaseVersion} deployed successfully!`, false);

      // Reset form after 3 seconds
      setTimeout(() => {
        setShowUpdateRelease(false);
        setReleaseVersion('');
        setReleaseNotes('');
        setReleaseSignature('');
        setReleaseStep('idle');
        setReleaseProgress(0);
      }, 3000);

    } catch (err) {
      setReleaseStep('failed');
      setReleaseError(String(err));
      addTerminalLine(`[Update Release] FAILED: ${err}`, true);
    }
  }

  function getStepLabel(step: UpdateReleaseStep): string {
    switch (step) {
      case 'uploading': return 'Uploading installer...';
      case 'updating_json': return 'Updating update.json...';
      case 'setting_ownership': return 'Setting ownership...';
      case 'verifying': return 'Verifying deployment...';
      case 'completed': return 'Deployment complete!';
      case 'failed': return 'Deployment failed';
      default: return 'Ready to deploy';
    }
  }

  function getActionsByCategory(category: string) {
    return quickActions.filter((a) => a.category === category);
  }

  // Group quick actions by category
  const categories = [
    { id: 'status', label: 'System Status', icon: Activity },
    { id: 'service', label: 'Services', icon: Server },
    { id: 'logs', label: 'Logs', icon: FileText },
  ];

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white/10">
            <Server className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="section-title mb-0">Server Monitor</h1>
            <p className="text-sm text-text-muted">
              {serverConfig ? (
                <>
                  {serverConfig.username}@{serverConfig.host}
                  {serverConfig.domain && (
                    <span className="text-text-muted"> ({serverConfig.domain})</span>
                  )}
                </>
              ) : (
                'Loading...'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasCredentials && (
            <>
              <button
                onClick={() => fetchSystemStatus()}
                disabled={statusLoading}
                className="btn btn-sm btn-secondary"
              >
                <RefreshCw size={14} className={statusLoading ? 'animate-spin' : ''} />
                Refresh Status
              </button>
              <button onClick={handleLogout} className="btn btn-sm btn-ghost text-red-400">
                <Unlock size={14} />
                Logout
              </button>
            </>
          )}
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
        <div className="flex-1 flex gap-6 min-h-0">
          {/* Left Panel: Quick Actions & Status */}
          <div className="w-80 flex flex-col gap-4 overflow-y-auto">
            {/* Login Card (if not authenticated) */}
            {!hasCredentials && (
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Lock size={18} className="text-amber-400" />
                  <h2 className="card-title mb-0">SSH Login</h2>
                </div>
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      placeholder="Enter SSH password"
                      className="input pr-10"
                      disabled={authLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={savePassword}
                      onChange={(e) => setSavePassword(e.target.checked)}
                      className="rounded"
                    />
                    Save password
                  </label>
                  {authError && (
                    <div className="text-sm text-red-400 flex items-center gap-1">
                      <AlertCircle size={14} />
                      {authError}
                    </div>
                  )}
                  <button
                    onClick={handleLogin}
                    disabled={authLoading || !password}
                    className="btn btn-primary w-full"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Key size={16} />
                        Connect
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Update Release Card */}
            {hasCredentials && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Rocket size={18} className="text-purple-400" />
                    <h2 className="card-title mb-0">Update Release</h2>
                  </div>
                  {!showUpdateRelease && atlasProjectPath && remoteUpdatePath && updateUrlBase && (
                    <button
                      onClick={() => setShowUpdateRelease(true)}
                      disabled={releaseStep !== 'idle' && releaseStep !== 'completed' && releaseStep !== 'failed'}
                      className="btn btn-sm btn-primary"
                    >
                      <Play size={14} />
                      Deploy
                    </button>
                  )}
                </div>

                {/* Warning if paths not configured */}
                {(!atlasProjectPath || !remoteUpdatePath || !updateUrlBase) && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-amber-400 text-sm">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <span>Configure the following in Settings to enable deployments:</span>
                      <ul className="list-disc list-inside mt-1 text-xs">
                        {!atlasProjectPath && <li>Atlas Project Path</li>}
                        {!remoteUpdatePath && <li>Remote Update Path</li>}
                        {!updateUrlBase && <li>Update URL Base</li>}
                      </ul>
                    </div>
                  </div>
                )}

                {showUpdateRelease && atlasProjectPath && remoteUpdatePath && updateUrlBase && (
                  <div className="space-y-3">
                    {/* Version Input */}
                    <div>
                      <label className="block text-sm text-text-muted mb-1">Version</label>
                      <input
                        type="text"
                        value={releaseVersion}
                        onChange={(e) => setReleaseVersion(e.target.value)}
                        placeholder="e.g., 1.1.0"
                        className="input"
                        disabled={releaseStep !== 'idle' && releaseStep !== 'failed'}
                      />
                      {releaseVersion && /^\d+\.\d+\.\d+$/.test(releaseVersion) && (
                        <div className="mt-1 text-xs flex items-center gap-1">
                          {signatureLoading ? (
                            <>
                              <Loader2 size={12} className="animate-spin text-text-muted" />
                              <span className="text-text-muted">Checking build files...</span>
                            </>
                          ) : installerExists === true ? (
                            <>
                              <CheckCircle size={12} className="text-green-400" />
                              <span className="text-green-400">Build found</span>
                            </>
                          ) : installerExists === false ? (
                            <>
                              <AlertCircle size={12} className="text-amber-400" />
                              <span className="text-amber-400">Build not found - run build first</span>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Release Notes Input */}
                    <div>
                      <label className="block text-sm text-text-muted mb-1">Release Notes (optional)</label>
                      <input
                        type="text"
                        value={releaseNotes}
                        onChange={(e) => setReleaseNotes(e.target.value)}
                        placeholder="Bug fixes and improvements"
                        className="input"
                        disabled={releaseStep !== 'idle' && releaseStep !== 'failed'}
                      />
                    </div>

                    {/* Signature Input */}
                    <div>
                      <label className="block text-sm text-text-muted mb-1">
                        Signature
                        {releaseSignature && installerExists && (
                          <span className="text-green-400 ml-2">(auto-loaded)</span>
                        )}
                      </label>
                      <textarea
                        value={releaseSignature}
                        onChange={(e) => setReleaseSignature(e.target.value)}
                        placeholder={signatureLoading ? "Loading signature..." : "Signature will auto-load when build exists..."}
                        className="input min-h-[80px] resize-none font-mono text-xs"
                        disabled={releaseStep !== 'idle' && releaseStep !== 'failed'}
                      />
                    </div>

                    {/* Progress Display */}
                    {releaseStep !== 'idle' && releaseStep !== 'failed' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          {releaseStep === 'completed' ? (
                            <CheckCircle size={14} className="text-green-400" />
                          ) : (
                            <Loader2 size={14} className="animate-spin text-accent-primary" />
                          )}
                          <span className={releaseStep === 'completed' ? 'text-green-400' : 'text-text-primary'}>
                            {getStepLabel(releaseStep)}
                          </span>
                        </div>
                        {releaseStep === 'uploading' && releaseProgress > 0 && (
                          <div className="w-full bg-white/10 rounded-full h-2">
                            <div
                              className="bg-accent-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${releaseProgress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step Indicators */}
                    {releaseStep !== 'idle' && (
                      <div className="flex items-center justify-between text-xs text-text-muted pt-2">
                        <div className={`flex items-center gap-1 ${['uploading', 'updating_json', 'setting_ownership', 'verifying', 'completed'].includes(releaseStep) ? 'text-green-400' : ''}`}>
                          {releaseStep === 'uploading' ? <Loader2 size={12} className="animate-spin" /> : releaseStep !== 'failed' ? <CheckCircle size={12} /> : <Circle size={12} />}
                          Upload
                        </div>
                        <div className={`flex items-center gap-1 ${['updating_json', 'setting_ownership', 'verifying', 'completed'].includes(releaseStep) ? 'text-green-400' : ''}`}>
                          {releaseStep === 'updating_json' ? <Loader2 size={12} className="animate-spin" /> : ['setting_ownership', 'verifying', 'completed'].includes(releaseStep) ? <CheckCircle size={12} /> : <Circle size={12} />}
                          JSON
                        </div>
                        <div className={`flex items-center gap-1 ${['setting_ownership', 'verifying', 'completed'].includes(releaseStep) ? 'text-green-400' : ''}`}>
                          {releaseStep === 'setting_ownership' ? <Loader2 size={12} className="animate-spin" /> : ['verifying', 'completed'].includes(releaseStep) ? <CheckCircle size={12} /> : <Circle size={12} />}
                          Owner
                        </div>
                        <div className={`flex items-center gap-1 ${['verifying', 'completed'].includes(releaseStep) ? 'text-green-400' : ''}`}>
                          {releaseStep === 'verifying' ? <Loader2 size={12} className="animate-spin" /> : releaseStep === 'completed' ? <CheckCircle size={12} /> : <Circle size={12} />}
                          Verify
                        </div>
                      </div>
                    )}

                    {/* Error Display */}
                    {releaseError && (
                      <div className="text-sm text-red-400 flex items-center gap-1">
                        <AlertCircle size={14} />
                        {releaseError}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={deployUpdateRelease}
                        disabled={(releaseStep !== 'idle' && releaseStep !== 'failed') || !installerExists || signatureLoading}
                        className="btn btn-primary flex-1"
                      >
                        {releaseStep !== 'idle' && releaseStep !== 'failed' && releaseStep !== 'completed' ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Deploying...
                          </>
                        ) : (
                          <>
                            <Upload size={16} />
                            Deploy
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowUpdateRelease(false);
                          setReleaseVersion('');
                          setReleaseNotes('');
                          setReleaseSignature('');
                          setReleaseStep('idle');
                          setReleaseProgress(0);
                          setReleaseError(null);
                          setInstallerExists(null);
                        }}
                        disabled={releaseStep !== 'idle' && releaseStep !== 'failed' && releaseStep !== 'completed'}
                        className="btn btn-ghost"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* System Status Card */}
            {systemStatus && (
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={18} className="text-green-400" />
                  <h2 className="card-title mb-0">System Status</h2>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Uptime</span>
                    <span className="text-text-primary">{systemStatus.uptime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Load Avg</span>
                    <span className="text-text-primary">{systemStatus.load_average}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Memory</span>
                    <span className="text-text-primary">
                      {systemStatus.memory_used} / {systemStatus.memory_total}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Disk</span>
                    <span className="text-text-primary">
                      {systemStatus.disk_used} / {systemStatus.disk_total}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">CPU Usage</span>
                    <span className="text-text-primary">{systemStatus.cpu_usage}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            {categories.map((cat) => {
              const actions = getActionsByCategory(cat.id);
              if (actions.length === 0) return null;
              const CategoryIcon = cat.icon;

              return (
                <div key={cat.id} className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <CategoryIcon size={16} className="text-accent-primary" />
                    <h3 className="text-sm font-medium text-text-secondary">{cat.label}</h3>
                  </div>
                  <div className="space-y-1">
                    {actions.map((action) => {
                      const ActionIcon = iconMap[action.icon] || Terminal;
                      return (
                        <button
                          key={action.id}
                          onClick={() => handleQuickAction(action)}
                          disabled={isExecuting || (!hasCredentials && !password)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg glass-subtle hover:bg-white/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                          title={action.description}
                        >
                          <ActionIcon size={14} className="text-text-muted" />
                          <span className="text-sm text-text-primary">{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Panel: Terminal */}
          <div className="flex-1 flex flex-col card p-0 overflow-hidden">
            {/* Terminal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-green-400" />
                <span className="text-sm font-medium text-text-primary">Terminal</span>
                {isExecuting && (
                  <span className="badge badge-pending text-xs">Running</span>
                )}
              </div>
              <button
                onClick={clearTerminal}
                className="btn btn-sm btn-ghost"
                title="Clear terminal"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Terminal Output */}
            <div
              ref={terminalRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-black/30"
            >
              {terminalLines.length === 0 ? (
                <div className="text-text-muted">
                  {hasCredentials || password
                    ? 'Ready. Enter a command or use quick actions.'
                    : 'Please login to start using the terminal.'}
                </div>
              ) : (
                terminalLines.map((line, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap ${
                      line.isCommand
                        ? 'text-cyan-400 font-bold'
                        : line.isStderr
                        ? 'text-red-400'
                        : 'text-text-primary'
                    }`}
                  >
                    {line.text}
                  </div>
                ))
              )}
            </div>

            {/* Command Input */}
            <form
              onSubmit={handleCommandSubmit}
              className="flex items-center gap-2 px-4 py-3 border-t border-white/10"
            >
              <span className="text-green-400 font-mono">$</span>
              <input
                type="text"
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                placeholder="Enter command..."
                disabled={isExecuting || (!hasCredentials && !password)}
                className="flex-1 bg-transparent border-none outline-none text-text-primary font-mono placeholder:text-text-muted"
              />
              <button
                type="submit"
                disabled={isExecuting || !currentCommand.trim() || (!hasCredentials && !password)}
                className="btn btn-sm btn-primary"
              >
                {isExecuting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
