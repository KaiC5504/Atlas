// Settings types

export interface ValorantCredentials {
  username: string;
  region: string;
  has_credentials: boolean; // true if credentials are set
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
}
