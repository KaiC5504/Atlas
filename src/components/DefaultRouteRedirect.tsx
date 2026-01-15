import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNavigationSettingsContext } from '../contexts';
import { NAVIGATION_ITEMS } from '../config/navigationItems';

export function DefaultRouteRedirect() {
  const { visibleItems, isLoading } = useNavigationSettingsContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    // Get the first visible item
    const firstVisibleItem = visibleItems[0];
    if (firstVisibleItem) {
      const navItem = NAVIGATION_ITEMS[firstVisibleItem];
      if (navItem) {
        navigate(navItem.to, { replace: true });
        return;
      }
    }

    // Fallback to settings if no visible items (should never happen since settings can't be hidden)
    navigate('/settings', { replace: true });
  }, [isLoading, visibleItems, navigate]);

  // Show loading state while settings are being fetched
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return null;
}
