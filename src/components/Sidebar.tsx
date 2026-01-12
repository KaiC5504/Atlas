// Sidebar navigation component
import { useState } from 'react';
import { NavigationItem } from './NavigationItem';
import { version } from '../../package.json';
import {
  LayoutDashboard,
  Download,
  BrainCircuit,
  Gamepad2,
  Server,
  Activity,
  Gauge,
  Library,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

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

      {/* Navigation items */}
      <nav className="flex-1 p-2 space-y-1">
        <NavigationItem
          to="/"
          label="Dashboard"
          icon={LayoutDashboard}
          collapsed={collapsed}
        />
        <NavigationItem
          to="/downloads"
          label="Downloads"
          icon={Download}
          collapsed={collapsed}
        />
        <NavigationItem
          to="/ml-processor"
          label="ML Processor"
          icon={BrainCircuit}
          collapsed={collapsed}
        />
        <NavigationItem
          to="/valorant"
          label="Valorant"
          icon={Gamepad2}
          collapsed={collapsed}
        />
        <NavigationItem
          to="/server"
          label="Server"
          icon={Server}
          collapsed={collapsed}
        />
        <NavigationItem
          to="/performance"
          label="Performance"
          icon={Activity}
          collapsed={collapsed}
        />
        <NavigationItem
          to="/gaming"
          label="Gaming"
          icon={Gauge}
          collapsed={collapsed}
        />
        <NavigationItem
          to="/launcher"
          label="Library"
          icon={Library}
          collapsed={collapsed}
        />
        <NavigationItem
          to="/settings"
          label="Settings"
          icon={Settings}
          collapsed={collapsed}
        />
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-text-muted text-center">
            v{version}
          </p>
        </div>
      )}
    </aside>
  );
}
