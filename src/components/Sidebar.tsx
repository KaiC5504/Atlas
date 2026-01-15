// Sidebar navigation component
import { useState } from 'react';
import { NavigationItem } from './NavigationItem';
import { version } from '../../package.json';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigationSettingsContext } from '../contexts';
import { NAVIGATION_ITEMS } from '../config/navigationItems';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { visibleItems, isLoading } = useNavigationSettingsContext();

  return (
    <aside
      className={`
        glass flex flex-col h-full
        transition-all duration-300 ease-out
        ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* Header with logo and collapse toggle */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        {!collapsed && (
          <span className="text-xl font-bold text-white tracking-tight animate-fade-in">
            Atlas
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-white/5 transition-all duration-200"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {!isLoading &&
          visibleItems.map(itemId => {
            const item = NAVIGATION_ITEMS[itemId];
            return (
              <NavigationItem
                key={item.id}
                to={item.to}
                label={item.label}
                icon={item.icon}
                collapsed={collapsed}
              />
            );
          })}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-text-muted text-center">v{version}</p>
        </div>
      )}
    </aside>
  );
}
