import { useState } from 'react';
import { Zap, Trash2, HardDrive, Play, Loader2, Check } from 'lucide-react';
import type { GamingProfile, KillResult } from '../../types/taskMonitor';

interface QuickActionsProps {
  profiles: GamingProfile[];
  onExecuteProfile: (id: string) => Promise<KillResult>;
  onKillBloat: () => Promise<KillResult>;
  disabled: boolean;
}

export function QuickActions({
  profiles,
  onExecuteProfile,
  onKillBloat,
  disabled,
}: QuickActionsProps) {
  const [executing, setExecuting] = useState<string | null>(null);
  const [result, setResult] = useState<{ action: string; result: KillResult } | null>(null);

  const defaultProfile = profiles.find((p) => p.is_default);

  const handleAction = async (action: string, fn: () => Promise<KillResult>) => {
    setExecuting(action);
    setResult(null);
    try {
      const killResult = await fn();
      setResult({ action, result: killResult });
      setTimeout(() => setResult(null), 3000);
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-white">Quick Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Prepare for Gaming */}
        <button
          onClick={() =>
            defaultProfile &&
            handleAction('gaming', () => onExecuteProfile(defaultProfile.id))
          }
          disabled={disabled || executing !== null || !defaultProfile}
          className="flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl hover:border-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="p-2 bg-indigo-500/20 rounded-lg group-hover:bg-indigo-500/30 transition-colors">
            {executing === 'gaming' ? (
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            ) : result?.action === 'gaming' ? (
              <Check className="w-5 h-5 text-green-400" />
            ) : (
              <Zap className="w-5 h-5 text-indigo-400" />
            )}
          </div>
          <div className="text-left">
            <div className="font-medium text-white">Prepare for Gaming</div>
            <div className="text-sm text-white/60">
              {result?.action === 'gaming'
                ? `Killed ${result.result.killed} processes`
                : 'Run default cleanup profile'}
            </div>
          </div>
        </button>

        {/* Kill All Bloat */}
        <button
          onClick={() => handleAction('bloat', onKillBloat)}
          disabled={disabled || executing !== null}
          className="flex items-center gap-3 p-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl hover:border-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="p-2 bg-purple-500/20 rounded-lg group-hover:bg-purple-500/30 transition-colors">
            {executing === 'bloat' ? (
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            ) : result?.action === 'bloat' ? (
              <Check className="w-5 h-5 text-green-400" />
            ) : (
              <Trash2 className="w-5 h-5 text-purple-400" />
            )}
          </div>
          <div className="text-left">
            <div className="font-medium text-white">Kill All Bloat</div>
            <div className="text-sm text-white/60">
              {result?.action === 'bloat'
                ? `Killed ${result.result.killed} processes`
                : 'Terminate Microsoft bloatware'}
            </div>
          </div>
        </button>

        {/* Free Up RAM */}
        <button
          onClick={() =>
            handleAction('ram', async () => {
              // Kill high-memory bloat and background processes
              const bloatResult = await onKillBloat();
              return bloatResult;
            })
          }
          disabled={disabled || executing !== null}
          className="flex items-center gap-3 p-4 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 rounded-xl hover:border-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="p-2 bg-cyan-500/20 rounded-lg group-hover:bg-cyan-500/30 transition-colors">
            {executing === 'ram' ? (
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
            ) : result?.action === 'ram' ? (
              <Check className="w-5 h-5 text-green-400" />
            ) : (
              <HardDrive className="w-5 h-5 text-cyan-400" />
            )}
          </div>
          <div className="text-left">
            <div className="font-medium text-white">Free Up RAM</div>
            <div className="text-sm text-white/60">
              {result?.action === 'ram'
                ? `Freed memory from ${result.result.killed} processes`
                : 'Kill memory-heavy processes'}
            </div>
          </div>
        </button>
      </div>

      {/* Profile shortcuts */}
      {profiles.length > 1 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {profiles
            .filter((p) => !p.is_default)
            .map((profile) => (
              <button
                key={profile.id}
                onClick={() =>
                  handleAction(`profile-${profile.id}`, () => onExecuteProfile(profile.id))
                }
                disabled={disabled || executing !== null}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg hover:border-white/20 transition-colors disabled:opacity-50 text-sm"
              >
                {executing === `profile-${profile.id}` ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                <span className="text-white/80">{profile.name}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
