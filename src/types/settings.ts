export interface ValorantCredentials {
  username: string;
  region: string;
  has_credentials: boolean; 
}

export interface ValorantCredentialsInput {
  username: string;
  password: string;
  region: string;
}

export interface Settings {
  download_path: string;
  default_quality: string;
  max_concurrent_downloads: number;
  max_concurrent_ml_jobs: number;
  valorant_credentials: ValorantCredentials | null;
  atlas_project_path: string | null;
  remote_update_path: string | null;
  update_url_base: string | null;
  developer_mode_enabled: boolean;
  sidebar_order: string[] | null;
  hidden_sidebar_items: string[] | null;
  discord_rich_presence_enabled: boolean;
  run_on_startup: boolean;
  close_to_tray: boolean;
  auto_restore_enabled: boolean;
  /** Selected gacha accounts for each game (game -> uid) */
  selected_gacha_accounts: Record<string, string> | null;
  /** User's display name for profile */
  user_display_name: string | null;
  /** Path to the user's avatar image (stored locally) */
  user_avatar_path: string | null;
  /** Whether the floating partner widget is enabled */
  partner_widget_enabled: boolean;
  /** X position of the floating partner widget */
  partner_widget_position_x: number | null;
  /** Y position of the floating partner widget */
  partner_widget_position_y: number | null;
}

export interface UpdateSettingsParams {
  download_path?: string;
  default_quality?: string;
  max_concurrent_downloads?: number;
  max_concurrent_ml_jobs?: number;
  valorant_credentials?: ValorantCredentialsInput | null;
  atlas_project_path?: string;
  remote_update_path?: string;
  update_url_base?: string;
  developer_mode_enabled?: boolean;
  sidebar_order?: string[];
  hidden_sidebar_items?: string[];
  discord_rich_presence_enabled?: boolean;
  run_on_startup?: boolean;
  close_to_tray?: boolean;
  auto_restore_enabled?: boolean;
  selected_gacha_accounts?: Record<string, string>;
  user_display_name?: string;
  user_avatar_path?: string;
  partner_widget_enabled?: boolean;
  partner_widget_position_x?: number;
  partner_widget_position_y?: number;
}
