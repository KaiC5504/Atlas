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
  Music2,
  ListTodo,
  Star,
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
  | 'playlist-uploader'
  | 'tasks'
  | 'gacha'
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
    to: '/dashboard',
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
  'playlist-uploader': {
    id: 'playlist-uploader',
    label: 'Music',
    to: '/playlist-uploader',
    icon: Music2,
    isDeveloperOnly: true,
  },
  tasks: {
    id: 'tasks',
    label: 'Tasks',
    to: '/tasks',
    icon: ListTodo,
    isDeveloperOnly: false,
  },
  gacha: {
    id: 'gacha',
    label: 'Gacha',
    to: '/gacha',
    icon: Star,
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
  'gacha',
  'gaming',
  'tasks',
  'performance',
  'valorant',
  'settings',
];

export const DEFAULT_DEVELOPER_ORDER: NavigationItemId[] = [
  'dashboard',
  'downloads',
  'ml-processor',
  'server',
  'playlist-uploader',
  'library',
  'gacha',
  'gaming',
  'tasks',
  'performance',
  'valorant',
  'settings',
];
