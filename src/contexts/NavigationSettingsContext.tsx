import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Settings, UpdateSettingsParams } from '../types';
import {
  type NavigationItemId,
  NAVIGATION_ITEMS,
  DEFAULT_ORDER,
  DEFAULT_DEVELOPER_ORDER,
} from '../config/navigationItems';

export interface NavigationSettingsContextValue {
  developerModeEnabled: boolean;
  visibleItems: NavigationItemId[];        
  orderedItems: NavigationItemId[];        
  hiddenItems: Set<NavigationItemId>;      
  isLoading: boolean;
  error: string | null;
  toggleDeveloperMode: () => Promise<void>;
  reorderItems: (newOrder: NavigationItemId[]) => Promise<void>;
  toggleItemVisibility: (itemId: NavigationItemId) => Promise<void>;
}

const NavigationSettingsContext = createContext<NavigationSettingsContextValue | null>(null);

export function NavigationSettingsProvider({ children }: { children: ReactNode }) {
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(false);
  const [customOrder, setCustomOrder] = useState<NavigationItemId[] | null>(null);
  const [hiddenItems, setHiddenItems] = useState<Set<NavigationItemId>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const settings = await invoke<Settings>('get_settings');
        setDeveloperModeEnabled(settings.developer_mode_enabled);
        setCustomOrder(settings.sidebar_order as NavigationItemId[] | null);
        setHiddenItems(new Set((settings.hidden_sidebar_items || []) as NavigationItemId[]));
      } catch (err) {
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const orderedItems = useMemo(() => {
    const defaultOrder = developerModeEnabled
      ? DEFAULT_DEVELOPER_ORDER
      : DEFAULT_ORDER;

    if (!customOrder) {
      return defaultOrder;
    }

    const allowedItems = new Set(
      Object.values(NAVIGATION_ITEMS)
        .filter(item => developerModeEnabled || !item.isDeveloperOnly)
        .map(item => item.id)
    );

    const filteredOrder = customOrder.filter(id => allowedItems.has(id));

    const orderedSet = new Set(filteredOrder);
    const missingItems = [...allowedItems].filter(id => !orderedSet.has(id));

    return [...filteredOrder, ...missingItems] as NavigationItemId[];
  }, [developerModeEnabled, customOrder]);

  const visibleItems = useMemo(() => {
    return orderedItems.filter(id => !hiddenItems.has(id));
  }, [orderedItems, hiddenItems]);

  const toggleDeveloperMode = useCallback(async () => {
    const newValue = !developerModeEnabled;
    setDeveloperModeEnabled(newValue);

    try {
      await invoke('update_settings', {
        settings: { developer_mode_enabled: newValue } as UpdateSettingsParams,
      });
    } catch (err) {
      setDeveloperModeEnabled(!newValue);
      setError(String(err));
    }
  }, [developerModeEnabled]);

  const reorderItems = useCallback(async (newOrder: NavigationItemId[]) => {
    const previousOrder = customOrder;
    setCustomOrder(newOrder);

    try {
      await invoke('update_settings', {
        settings: { sidebar_order: newOrder } as UpdateSettingsParams,
      });
    } catch (err) {
      setCustomOrder(previousOrder);
      setError(String(err));
    }
  }, [customOrder]);

  const toggleItemVisibility = useCallback(async (itemId: NavigationItemId) => {
    // Settings cannot be hidden
    if (itemId === 'settings') return;

    const previousHidden = hiddenItems;
    const newHidden = new Set(hiddenItems);

    if (newHidden.has(itemId)) {
      newHidden.delete(itemId);
    } else {
      newHidden.add(itemId);
    }

    setHiddenItems(newHidden);

    try {
      await invoke('update_settings', {
        settings: { hidden_sidebar_items: [...newHidden] } as UpdateSettingsParams,
      });
    } catch (err) {
      setHiddenItems(previousHidden);
      setError(String(err));
    }
  }, [hiddenItems]);

  const value = useMemo(() => ({
    developerModeEnabled,
    visibleItems,
    orderedItems,
    hiddenItems,
    isLoading,
    error,
    toggleDeveloperMode,
    reorderItems,
    toggleItemVisibility,
  }), [developerModeEnabled, visibleItems, orderedItems, hiddenItems, isLoading, error, toggleDeveloperMode, reorderItems, toggleItemVisibility]);

  return (
    <NavigationSettingsContext.Provider value={value}>
      {children}
    </NavigationSettingsContext.Provider>
  );
}

export function useNavigationSettingsContext(): NavigationSettingsContextValue {
  const context = useContext(NavigationSettingsContext);
  if (!context) {
    throw new Error('useNavigationSettingsContext must be used within NavigationSettingsProvider');
  }
  return context;
}
