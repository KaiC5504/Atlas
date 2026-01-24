import { useState } from 'react';
import { Heart, Sparkles, ArrowRight, Wand2 } from 'lucide-react';
import type { LocalUserData } from '../../types/friends';

interface SetupWizardProps {
  onComplete: (username: string) => Promise<void>;
  onCreateDemo: () => Promise<void>;
  existingUser: LocalUserData | null;
}

export function SetupWizard({ onComplete, onCreateDemo, existingUser }: SetupWizardProps) {
  const [username, setUsername] = useState(existingUser?.username || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    if (username.length > 32) {
      setError('Username must be 32 characters or less');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onComplete(username.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemo = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Set a default username first
      if (!username.trim()) {
        setUsername('You');
        await onComplete('You');
      } else {
        await onComplete(username.trim());
      }
      await onCreateDemo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo setup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-500/20 mb-4">
            <Heart className="w-8 h-8 text-pink-400" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Welcome to Friends
          </h1>
          <p className="text-text-secondary">
            Connect with your special person and friends to share your gaming journey
          </p>
        </div>

        {/* Setup Form */}
        <div className="glass-elevated rounded-xl p-6">
          <form onSubmit={handleSubmit}>
            {/* Username Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-text-primary mb-2">
                Your Display Name
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your name..."
                className="input w-full"
                maxLength={32}
                disabled={isLoading}
              />
              <p className="text-xs text-text-tertiary mt-1">
                This is how your partner and friends will see you
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Sparkles className="w-4 h-4 animate-pulse" />
              ) : (
                <>
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-surface-elevated text-text-tertiary">or</span>
            </div>
          </div>

          {/* Demo Button */}
          <button
            onClick={handleDemo}
            disabled={isLoading}
            className="btn btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Wand2 className="w-4 h-4" />
            Try with Demo Data
          </button>
          <p className="text-xs text-text-tertiary text-center mt-2">
            See how the feature works with sample data
          </p>
        </div>

        {/* Features Preview */}
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="glass rounded-lg p-4">
            <div className="text-pink-400 font-medium mb-1">Partner Mode</div>
            <p className="text-xs text-text-secondary">
              Share memories, messages, and track special dates
            </p>
          </div>
          <div className="glass rounded-lg p-4">
            <div className="text-indigo-400 font-medium mb-1">Gaming Stats</div>
            <p className="text-xs text-text-secondary">
              Compare gacha luck and gaming sessions
            </p>
          </div>
          <div className="glass rounded-lg p-4">
            <div className="text-purple-400 font-medium mb-1">Rich Presence</div>
            <p className="text-xs text-text-secondary">
              See what games your partner is playing
            </p>
          </div>
          <div className="glass rounded-lg p-4">
            <div className="text-green-400 font-medium mb-1">Poke System</div>
            <p className="text-xs text-text-secondary">
              Send quick reactions and thinking of you
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
