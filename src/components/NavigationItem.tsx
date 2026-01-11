// NavigationItem component - single navigation link with icon
import { NavLink } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';

interface NavigationItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
}

export function NavigationItem({ to, label, icon: Icon, collapsed }: NavigationItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `
        flex items-center gap-3 px-3 py-2.5 rounded-lg
        transition-all duration-200 ease-out
        ${isActive
          ? 'bg-accent-primary/20 text-white border-l-2 border-accent-primary pl-[10px]'
          : 'text-text-secondary hover:bg-white/5 hover:text-white'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
      title={collapsed ? label : undefined}
    >
      <Icon size={20} className="shrink-0" />
      {!collapsed && (
        <span className="truncate animate-fade-in">{label}</span>
      )}
    </NavLink>
  );
}
