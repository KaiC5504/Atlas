use std::path::PathBuf;

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use crate::models::launcher::{DetectedGame, GameSource};
use crate::launcher::icon_extractor::{extract_icon_from_exe, get_icon_cache_dir, download_riot_icon};

#[derive(Debug, Clone)]
pub struct RiotGameConfig {
    pub name: &'static str,
    pub folder_name: &'static str,
    pub game_exe_path: &'static str,  
    pub icon_exe_path: Option<&'static str>,  
    #[allow(dead_code)]
    pub process_name: &'static str,   
    pub product_id: &'static str,     
    pub patchline: &'static str,      
}

impl RiotGameConfig {
    pub const VALORANT: RiotGameConfig = RiotGameConfig {
        name: "Valorant",
        folder_name: "VALORANT",
        game_exe_path: r"live\ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe",
        icon_exe_path: Some(r"live\VALORANT.exe"),  
        process_name: "VALORANT-Win64-Shipping.exe",
        product_id: "valorant",
        patchline: "live",
    };

    pub const LEAGUE_OF_LEGENDS: RiotGameConfig = RiotGameConfig {
        name: "League of Legends",
        folder_name: "League of Legends",
        game_exe_path: r"LeagueClient.exe",
        icon_exe_path: None,
        process_name: "LeagueClient.exe",
        product_id: "league_of_legends",
        patchline: "live",
    };

    pub const LEGENDS_OF_RUNETERRA: RiotGameConfig = RiotGameConfig {
        name: "Legends of Runeterra",
        folder_name: "LoR",
        game_exe_path: r"Legends of Runeterra.exe",
        icon_exe_path: None,
        process_name: "Legends of Runeterra.exe",
        product_id: "bacon",  
        patchline: "live",
    };

    pub fn all() -> Vec<RiotGameConfig> {
        vec![
            Self::VALORANT,
            Self::LEAGUE_OF_LEGENDS,
            Self::LEGENDS_OF_RUNETERRA,
        ]
    }

    pub fn get_launch_args(&self) -> String {
        format!("--launch-product={} --launch-patchline={}", self.product_id, self.patchline)
    }
}


#[cfg(windows)]
pub fn detect_riot_games() -> Vec<DetectedGame> {
    let mut games = Vec::new();

    let riot_paths = find_riot_games_paths();

    for riot_path in riot_paths {

        let riot_client_path = riot_path.join("Riot Client").join("RiotClientServices.exe");

        if !riot_client_path.exists() {
            continue;
        }

        let riot_client_str = riot_client_path.to_string_lossy().to_string();

        for config in RiotGameConfig::all() {
            let game_folder = riot_path.join(config.folder_name);
            let game_exe_path = game_folder.join(config.game_exe_path);

            if game_exe_path.exists() {
               
                let app_id = format!("riot_{}", config.product_id);
                if games.iter().any(|g: &DetectedGame| g.app_id.as_ref() == Some(&app_id)) {
                    continue;
                }

                let icon_exe_path = config.icon_exe_path
                    .map(|p| game_folder.join(p))
                    .unwrap_or_else(|| game_exe_path.clone());

                let icon_path = get_icon_cache_dir().and_then(|cache_dir| {
                   
                    download_riot_icon(config.product_id, &cache_dir)

                        .or_else(|| find_riot_product_icon(&riot_path, config.product_id, &cache_dir))

                        .or_else(|| extract_icon_from_exe(&icon_exe_path, &cache_dir))

                        .or_else(|| find_ico_in_folder(&game_folder, &cache_dir, config.product_id))

                        .or_else(|| extract_icon_from_exe(&riot_client_path, &cache_dir))
                });

                games.push(DetectedGame {
                    name: config.name.to_string(),
                    executable_path: riot_client_str.clone(),
                    install_path: game_folder.to_string_lossy().to_string(),
                    source: GameSource::Riot,
                    app_id: Some(app_id),
                    icon_path,
                    launch_args: Some(config.get_launch_args()),
                });
            }
        }
    }

    games
}

#[cfg(not(windows))]
pub fn detect_riot_games() -> Vec<DetectedGame> {
    Vec::new()
}

fn find_riot_product_icon(riot_path: &std::path::Path, product_id: &str, cache_dir: &std::path::Path) -> Option<String> {
    use std::fs;

    let output_path = cache_dir.join(format!("riot_{}.png", product_id));

    if output_path.exists() {
        return Some(output_path.to_string_lossy().to_string());
    }

    if let Some(program_data) = std::env::var_os("PROGRAMDATA") {
        let metadata_ico = PathBuf::from(&program_data)
            .join("Riot Games")
            .join("Metadata")
            .join(format!("{}.live", product_id))
            .join(format!("{}.live.ico", product_id));

        if metadata_ico.exists() {
            if let Some(icon_path) = convert_ico_to_png(&metadata_ico, &output_path) {
                return Some(icon_path);
            }
        }
    }

    let icon_search_paths = [
        riot_path.join("Riot Client").join("UX").join("images"),
        riot_path.join("Riot Client").join("UX").join("assets"),
        riot_path.join("Riot Client").join("UX"),
        riot_path.join("Metadata").join(product_id),
    ];

    let icon_patterns: Vec<String> = vec![
        format!("{}.ico", product_id),
        format!("{}.png", product_id),
        format!("{}_icon.ico", product_id),
        format!("{}_icon.png", product_id),
        format!("{}-icon.ico", product_id),
        format!("{}-icon.png", product_id),
    ];

    for search_path in &icon_search_paths {
        if !search_path.exists() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(search_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                let filename = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                let is_match = icon_patterns.iter().any(|p| filename == p.to_lowercase())
                    || (filename.contains(product_id) &&
                        (filename.ends_with(".png") || filename.ends_with(".ico")));

                if is_match {
                    if filename.ends_with(".png") {
                        if fs::copy(&path, &output_path).is_ok() {
                            return Some(output_path.to_string_lossy().to_string());
                        }
                    } else if filename.ends_with(".ico") {
                        if let Some(icon_path) = convert_ico_to_png(&path, &output_path) {
                            return Some(icon_path);
                        }
                    }
                }
            }
        }
    }

    None
}

fn find_ico_in_folder(game_folder: &std::path::Path, cache_dir: &std::path::Path, product_id: &str) -> Option<String> {
    use std::fs;

    let search_paths = [
        game_folder.to_path_buf(),
        game_folder.join("live"),
    ];

    for search_path in &search_paths {
        if !search_path.exists() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(search_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e.to_ascii_lowercase() == "ico").unwrap_or(false) {
                    let output_path = cache_dir.join(format!("riot_{}.png", product_id));

                    if output_path.exists() {
                        return Some(output_path.to_string_lossy().to_string());
                    }

                    if let Some(icon_path) = convert_ico_to_png(&path, &output_path) {
                        return Some(icon_path);
                    }
                }
            }
        }
    }

    None
}

#[cfg(windows)]
fn convert_ico_to_png(ico_path: &std::path::Path, output_path: &std::path::Path) -> Option<String> {
    use std::process::Command;

    let ps_script = format!(
        r#"
Add-Type -AssemblyName System.Drawing

$icoPath = '{}'
$outPath = '{}'

# Read all bytes from the ICO file
$bytes = [System.IO.File]::ReadAllBytes($icoPath)

# ICO header: 2 bytes reserved, 2 bytes type, 2 bytes count
$count = [BitConverter]::ToUInt16($bytes, 4)

$largest = $null
$largestSize = 0

# Each directory entry is 16 bytes starting at offset 6
for ($i = 0; $i -lt $count; $i++) {{
    $offset = 6 + ($i * 16)
    $width = $bytes[$offset]
    $height = $bytes[$offset + 1]

    # Width/height of 0 means 256
    if ($width -eq 0) {{ $width = 256 }}
    if ($height -eq 0) {{ $height = 256 }}

    $size = $width * $height
    if ($size -gt $largestSize) {{
        $largestSize = $size
        $imageSize = [BitConverter]::ToUInt32($bytes, $offset + 8)
        $imageOffset = [BitConverter]::ToUInt32($bytes, $offset + 12)
        $largest = @{{ Width = $width; Height = $height; Index = $i; ImageSize = $imageSize; ImageOffset = $imageOffset }}
    }}
}}

$extracted = $false

# Check if largest icon is embedded PNG (256x256 icons usually are)
# PNG signature: 0x89 0x50 0x4E 0x47 (‰PNG)
if ($largest.ImageOffset -lt $bytes.Length -and $largest.ImageSize -gt 8) {{
    $off = $largest.ImageOffset
    if ($bytes[$off] -eq 0x89 -and $bytes[$off+1] -eq 0x50 -and $bytes[$off+2] -eq 0x4E -and $bytes[$off+3] -eq 0x47) {{
        # Extract embedded PNG directly
        $pngBytes = New-Object byte[] $largest.ImageSize
        [Array]::Copy($bytes, $largest.ImageOffset, $pngBytes, 0, $largest.ImageSize)
        [System.IO.File]::WriteAllBytes($outPath, $pngBytes)
        $extracted = $true
    }}
}}

# Fallback: use System.Drawing.Icon for BMP-based icons
if (-not $extracted) {{
    try {{
        $stream = [System.IO.File]::OpenRead($icoPath)
        $icon = [System.Drawing.Icon]::new($stream, $largest.Width, $largest.Height)
        $bmp = $icon.ToBitmap()
        $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $icon.Dispose()
        $stream.Dispose()
    }} catch {{
        $icon = [System.Drawing.Icon]::new($icoPath)
        $bmp = $icon.ToBitmap()
        $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $icon.Dispose()
    }}
}}

Write-Output 'SUCCESS'
"#,
        ico_path.to_string_lossy().replace("'", "''"),
        output_path.to_string_lossy().replace("'", "''")
    );

    let result = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match result {
        Ok(output) if output.status.success() && output_path.exists() => {
            Some(output_path.to_string_lossy().to_string())
        }
        _ => None,
    }
}

#[cfg(not(windows))]
fn convert_ico_to_png(_ico_path: &std::path::Path, _output_path: &std::path::Path) -> Option<String> {
    None
}

#[cfg(windows)]
fn find_riot_games_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    paths.extend(find_riot_from_config());

    paths.extend(find_riot_from_registry());

    paths.extend(find_riot_from_folders());

    paths.sort_by(|a, b| a.to_string_lossy().to_lowercase().cmp(&b.to_string_lossy().to_lowercase()));
    paths.dedup_by(|a, b| a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase());

    paths
}

#[cfg(windows)]
fn find_riot_from_config() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(local_data) = dirs::data_local_dir() {
        let riot_config = local_data.join("Riot Games").join("RiotClientInstalls.json");

        if let Ok(content) = std::fs::read_to_string(&riot_config) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                for key in ["rc_default", "rc_live", "associated_client"] {
                    if let Some(path_obj) = json.get(key) {
                        if let Some(path_str) = path_obj.as_str() {
                            if let Some(riot_root) = extract_riot_root_from_path(path_str) {
                                if !paths.contains(&riot_root) {
                                    paths.push(riot_root);
                                }
                            }
                        } else if let Some(obj) = path_obj.as_object() {
                            for (_, v) in obj {
                                if let Some(path_str) = v.as_str() {
                                    if let Some(riot_root) = extract_riot_root_from_path(path_str) {
                                        if !paths.contains(&riot_root) {
                                            paths.push(riot_root);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(program_data) = std::env::var_os("PROGRAMDATA") {
        let riot_config = PathBuf::from(program_data).join("Riot Games").join("RiotClientInstalls.json");

        if let Ok(content) = std::fs::read_to_string(&riot_config) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                for key in ["rc_default", "rc_live", "associated_client"] {
                    if let Some(path_obj) = json.get(key) {
                        if let Some(path_str) = path_obj.as_str() {
                            if let Some(riot_root) = extract_riot_root_from_path(path_str) {
                                if !paths.contains(&riot_root) {
                                    paths.push(riot_root);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    paths
}

fn extract_riot_root_from_path(path: &str) -> Option<PathBuf> {
    let path = PathBuf::from(path);

    let mut current = path.as_path();

    for _ in 0..5 {
        if let Some(parent) = current.parent() {
            let name = parent.file_name()?.to_string_lossy().to_lowercase();
            if name == "riot games" {
                if parent.exists() {
                    return Some(parent.to_path_buf());
                }
            }
            current = parent;
        } else {
            break;
        }
    }

    None
}

#[cfg(windows)]
fn find_riot_from_registry() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    let uninstall_roots = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    for (root, uninstall_path) in uninstall_roots {
        if let Ok(uninstall_key) = RegKey::predef(root).open_subkey(uninstall_path) {
            for key_name in uninstall_key.enum_keys().filter_map(|k| k.ok()) {
                let key_lower = key_name.to_lowercase();

                if key_lower.contains("riot") || key_lower.contains("valorant")
                   || key_lower.contains("league") || key_lower.contains("runeterra") {

                    if let Ok(subkey) = uninstall_key.open_subkey(&key_name) {
                        if let Ok(install_path) = subkey.get_value::<String, _>("InstallLocation") {
                            let riot_root = find_riot_root_from_install(&install_path);
                            if riot_root.exists() && !paths.contains(&riot_root) {
                                paths.push(riot_root);
                            }
                        }
                    }
                }
            }
        }
    }

    let riot_registry_paths = [
        (HKEY_CURRENT_USER, r"SOFTWARE\Riot Games"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Riot Games"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Riot Games"),
    ];

    for (root, path) in riot_registry_paths {
        if let Ok(key) = RegKey::predef(root).open_subkey(path) {
            if let Ok(path_value) = key.get_value::<String, _>("Path") {
                let p = PathBuf::from(&path_value);
                if p.exists() && !paths.contains(&p) {
                    paths.push(p);
                }
            }
        }
    }

    paths
}

fn find_riot_root_from_install(install_path: &str) -> PathBuf {
    let path = PathBuf::from(install_path);
    let mut current = path.as_path();

    for _ in 0..3 {
        let name = current.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        if name == "riot games" {
            return current.to_path_buf();
        }

        if let Some(parent) = current.parent() {
            current = parent;
        } else {
            break;
        }
    }

    path
}

#[cfg(windows)]
fn find_riot_from_folders() -> Vec<PathBuf> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
    const DRIVE_FIXED: u32 = 3;

    let mut paths = Vec::new();

    for letter in b'C'..=b'Z' {
        let drive_char = letter as char;
        let drive = format!("{}:\\", drive_char);
        let drive_path = PathBuf::from(&drive);

        let wide: Vec<u16> = OsStr::new(&drive)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let drive_type = unsafe { GetDriveTypeW(wide.as_ptr()) };
        if drive_type != DRIVE_FIXED {
            continue;
        }

        if !drive_path.exists() {
            continue;
        }

        let possible_paths = [
            drive_path.join("Riot Games"),
            drive_path.join("Program Files").join("Riot Games"),
            drive_path.join("Program Files (x86)").join("Riot Games"),
            drive_path.join("Games").join("Riot Games"),
            drive_path.join("Entertainment").join("Riot Games"),  // User's case
            drive_path.join("Gaming").join("Riot Games"),
        ];

        for path in possible_paths {
            if path.exists() && path.is_dir() && !paths.contains(&path) {
                paths.push(path);
            }
        }
    }

    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_riot_game_configs() {
        let configs = RiotGameConfig::all();
        assert_eq!(configs.len(), 3);
        assert_eq!(configs[0].name, "Valorant");
        assert_eq!(configs[0].product_id, "valorant");
        assert_eq!(configs[1].name, "League of Legends");
        assert_eq!(configs[1].product_id, "league_of_legends");
        assert_eq!(configs[2].name, "Legends of Runeterra");
        assert_eq!(configs[2].product_id, "bacon");
    }

    #[test]
    fn test_launch_args() {
        let valorant = RiotGameConfig::VALORANT;
        assert_eq!(valorant.get_launch_args(), "--launch-product=valorant --launch-patchline=live");

        let lol = RiotGameConfig::LEAGUE_OF_LEGENDS;
        assert_eq!(lol.get_launch_args(), "--launch-product=league_of_legends --launch-patchline=live");
    }

    #[test]
    fn test_find_riot_root_from_install() {
        let path = r"E:\Entertainment\Riot Games\VALORANT\live";
        let result = find_riot_root_from_install(path);
        assert!(result.to_string_lossy().contains("VALORANT") || result.to_string_lossy().contains("Riot Games"));
    }
}
