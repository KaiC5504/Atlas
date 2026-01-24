import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Gamepad2 } from 'lucide-react';
import { useFriends } from '../../hooks/useFriends';
import { usePartnerPresence } from '../../hooks/usePartnerPresence';
import type { Settings } from '../../types/settings';

const WIDGET_SIZE = 56;
const DEFAULT_OFFSET = 20;

export function FloatingPartnerWidget() {
  const navigate = useNavigate();
  const { partner, isLoading } = useFriends();
  const { partnerPresence } = usePartnerPresence();

  const [enabled, setEnabled] = useState(true);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const widgetRef = useRef<HTMLDivElement>(null);

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await invoke<Settings>('get_settings');
        setEnabled(settings.partner_widget_enabled);

        if (settings.partner_widget_position_x !== null && settings.partner_widget_position_y !== null) {
          setPosition({
            x: settings.partner_widget_position_x,
            y: settings.partner_widget_position_y,
          });
        } else {
          // Default position: bottom-right corner
          setPosition({
            x: window.innerWidth - WIDGET_SIZE - DEFAULT_OFFSET,
            y: window.innerHeight - WIDGET_SIZE - DEFAULT_OFFSET,
          });
        }
      } catch (e) {
        console.error('Failed to load widget settings:', e);
        // Default position on error
        setPosition({
          x: window.innerWidth - WIDGET_SIZE - DEFAULT_OFFSET,
          y: window.innerHeight - WIDGET_SIZE - DEFAULT_OFFSET,
        });
      } finally {
        setSettingsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // Clamp position to viewport bounds
  const clampPosition = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth - WIDGET_SIZE;
    const maxY = window.innerHeight - WIDGET_SIZE;
    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY)),
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (position) {
        setPosition(clampPosition(position.x, position.y));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, clampPosition]);

  // Handle mouse down - start drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click

    e.preventDefault();
    setIsDragging(true);

    const rect = widgetRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  // Handle mouse move - update position during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newPos = clampPosition(
        e.clientX - dragOffset.x,
        e.clientY - dragOffset.y
      );
      setPosition(newPos);
    };

    const handleMouseUp = async () => {
      setIsDragging(false);

      // Persist position to settings
      if (position) {
        try {
          await invoke('update_settings', {
            settings: {
              partner_widget_position_x: position.x,
              partner_widget_position_y: position.y,
            },
          });
        } catch (e) {
          console.error('Failed to save widget position:', e);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, position, clampPosition]);

  // Handle click - navigate to friends
  const handleClick = () => {
    if (!isDragging) {
      navigate('/friends');
    }
  };

  // Don't render if not enabled, no partner, or still loading
  if (!enabled || !settingsLoaded || isLoading || !partner || !position) {
    return null;
  }

  const presence = partnerPresence || partner.presence;
  const displayName = partner.friend.nickname || partner.user.username;
  const initial = displayName[0]?.toUpperCase() || '?';

  // Presence ring color
  const getRingColor = () => {
    switch (presence?.status) {
      case 'online':
        return 'ring-green-500';
      case 'in_game':
        return 'ring-purple-500';
      case 'away':
        return 'ring-yellow-500';
      default:
        return 'ring-gray-600';
    }
  };

  return (
    <div
      ref={widgetRef}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: WIDGET_SIZE,
        height: WIDGET_SIZE,
        zIndex: 9999,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      className="group"
      title={`${displayName} - Click to view, drag to move`}
    >
      {/* Avatar circle */}
      <div
        className={`
          w-full h-full rounded-full
          flex items-center justify-center
          text-lg font-bold text-white
          bg-gradient-to-br from-pink-500 to-purple-500
          ring-[3px] ${getRingColor()}
          shadow-lg
          transition-transform duration-150
          ${isDragging ? 'scale-105' : 'group-hover:scale-105'}
        `}
      >
        {partner.user.avatar_url ? (
          <img
            src={partner.user.avatar_url}
            alt={displayName}
            className="w-full h-full rounded-full object-cover"
            draggable={false}
          />
        ) : (
          initial
        )}
      </div>

      {/* Game indicator badge */}
      {presence?.status === 'in_game' && (
        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center shadow-md">
          <Gamepad2 className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
}
