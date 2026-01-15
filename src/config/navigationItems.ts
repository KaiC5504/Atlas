import type { LucideIcon } from 'lucide-react';
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
} from 'lucide-react';

export type NavigationItemId =
  | 'dashboard'
  | 'downloads'
  | 'ml-processor'
  | 'valorant'
  | 'server'
  | 'performance'
  | 'gaming'
  | 'library'
  | 'settings';

export interface NavigationItemConfig {
  id: NavigationItemId;
  label: string;
  to: string;
  icon: LucideIcon;
  isDeveloperOnly: boolean;
}

export const NAVIGATION_ITEMS: Record<NavigationItemId, NavigationItemConfig> = {
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    to: '/',
    icon: LayoutDashboard,
    isDeveloperOnly: true,
  },
  downloads: {
    id: 'downloads',
    label: 'Downloads',
    to: '/downloads',
    icon: Download,
    isDeveloperOnly: true,
  },
  'ml-processor': {
    id: 'ml-processor',
    label: 'ML Processor',
    to: '/ml-processor',
    icon: BrainCircuit,
    isDeveloperOnly: true,
  },
  valorant: {
    id: 'valorant',
    label: 'Valorant',
    to: '/valorant',
    icon: Gamepad2,
    isDeveloperOnly: false,
  },
  server: {
    id: 'server',
    label: 'Server',
    to: '/server',
    icon: Server,
    isDeveloperOnly: true,
  },
  performance: {
    id: 'performance',
    label: 'Performance',
    to: '/performance',
    icon: Activity,
    isDeveloperOnly: false,
  },
  gaming: {
    id: 'gaming',
    label: 'Gaming',
    to: '/gaming',
    icon: Gauge,
    isDeveloperOnly: false,
  },
  library: {
    id: 'library',
    label: 'Library',
    to: '/launcher',
    icon: Library,
    isDeveloperOnly: false,
  },
  settings: {
    id: 'settings',
    label: 'Settings',
    to: '/settings',
    icon: Settings,
    isDeveloperOnly: false,
  },
};

export const DEFAULT_ORDER: NavigationItemId[] = [
  'library',
  'gaming',
  'performance',
  'valorant',
  'settings',
];

export const DEFAULT_DEVELOPER_ORDER: NavigationItemId[] = [
  'dashboard',
  'downloads',
  'ml-processor',
  'server',
  'library',
  'gaming',
  'performance',
  'valorant',
  'settings',
];
