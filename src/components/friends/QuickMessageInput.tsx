import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface QuickMessageInputProps {
  onSend: (message: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function QuickMessageInput({
  onSend,
  placeholder = 'Type a message...',
  disabled = false,
  autoFocus = false,
}: QuickMessageInputProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending || disabled) return;

    setIsSending(true);
    try {
      await onSend(message.trim());
      setMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isSending}
          className="input w-full pr-10"
        />
      </div>
      <button
        type="submit"
        disabled={!message.trim() || isSending || disabled}
        className="btn btn-primary p-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Send className="w-5 h-5" />
        )}
      </button>
    </form>
  );
}

interface MessageBubbleProps {
  content: string;
  isSent: boolean;
  timestamp: number;
  isRead?: boolean;
}

export function MessageBubble({ content, isSent, timestamp, isRead }: MessageBubbleProps) {
  const time = new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
          isSent
            ? 'bg-indigo-600 text-white rounded-br-md'
            : 'bg-white/10 text-text-primary rounded-bl-md'
        }`}
      >
        <div className="break-words">{content}</div>
        <div
          className={`text-xs mt-1 flex items-center gap-1 ${
            isSent ? 'text-indigo-200' : 'text-text-tertiary'
          }`}
        >
          {time}
          {isSent && isRead && <span>• Read</span>}
        </div>
      </div>
    </div>
  );
}

interface ChatContainerProps {
  children: React.ReactNode;
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatContainer({ children, onSend, disabled }: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [children]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {children}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-white/10">
        <QuickMessageInput onSend={onSend} disabled={disabled} />
      </div>
    </div>
  );
}
