// Icon extractor for game executables
// Extracts icons from .exe files on Windows using PowerShell

use std::io::Read;
use std::path::Path;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Windows constant to hide console window
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Extract icon from an executable and save it as PNG (256x256 HD)
/// Returns the path to the saved icon file, or None if extraction failed
#[cfg(windows)]
pub fn extract_icon_from_exe(exe_path: &Path, output_dir: &Path) -> Option<String> {
    use std::fs;

    // Ensure output directory exists - log if it fails
    if let Err(e) = fs::create_dir_all(output_dir) {
        eprintln!("[Icon Extractor] Failed to create directory {:?}: {}", output_dir, e);
        return None;
    }

    // Generate output filename based on exe name
    let exe_name = exe_path.file_stem()?.to_string_lossy().to_string();
    let output_path = output_dir.join(format!("{}.png", exe_name));

    // If icon already exists, return it
    if output_path.exists() {
        return Some(output_path.to_string_lossy().to_string());
    }

    // Check if exe exists
    if !exe_path.exists() {
        eprintln!("[Icon Extractor] Exe not found: {:?}", exe_path);
        return None;
    }

    let exe_path_str = exe_path.to_string_lossy().to_string();
    let output_path_str = output_path.to_string_lossy().to_string();

    // Try advanced method first for high-quality 256x256 icons
    // Only fall back to simple method if advanced fails
    if let Some(result) = extract_icon_advanced(&exe_path_str, &output_path_str, &output_path) {
        return Some(result);
    }

    // Fallback to simple method (smaller icons, but more reliable)
    extract_icon_simple(&exe_path_str, &output_path_str)
}

/// Simple icon extraction using ExtractAssociatedIcon (more reliable)
#[cfg(windows)]
fn extract_icon_simple(exe_path_str: &str, output_path_str: &str) -> Option<String> {
    let ps_script = format!(
        r#"
Add-Type -AssemblyName System.Drawing
try {{
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{}')
    if ($icon) {{
        $bmp = $icon.ToBitmap()
        $bmp.Save('{}', [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $icon.Dispose()
        Write-Output 'SUCCESS'
    }}
}} catch {{
    Write-Error $_.Exception.Message
}}
"#,
        exe_path_str.replace("'", "''"),
        output_path_str.replace("'", "''")
    );

    let result = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("SUCCESS") && Path::new(output_path_str).exists() {
                return Some(output_path_str.to_string());
            }
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("[Icon Extractor] Simple method failed: {}", stderr);
            }
            None
        }
        Err(e) => {
            eprintln!("[Icon Extractor] PowerShell execution failed: {}", e);
            None
        }
    }
}

/// Advanced icon extraction for higher quality (256x256) icons
#[cfg(windows)]
fn extract_icon_advanced(exe_path_str: &str, output_path_str: &str, output_path: &Path) -> Option<String> {

    // PowerShell script to extract largest icon (256x256 if available)
    // Uses Shell32 to get the jumbo icon (256x256) instead of small associated icon
    let ps_script = format!(
        r#"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Drawing;

public class IconExtractor {{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, IntPtr psfi, uint cbFileInfo, uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHGetImageList(int iImageList, ref Guid riid, out IImageList ppv);

    [DllImport("comctl32.dll", SetLastError = true)]
    private static extern IntPtr ImageList_GetIcon(IntPtr himl, int i, int flags);

    private const uint SHGFI_SYSICONINDEX = 0x4000;
    private const uint SHGFI_ICON = 0x100;
    private const uint SHGFI_LARGEICON = 0x0;
    private const int SHIL_JUMBO = 4;
    private const int SHIL_EXTRALARGE = 2;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEINFO {{
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }}

    [ComImport, Guid("46EB5926-582E-4017-9FDF-E8998DAA0950"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IImageList {{
        int Add(IntPtr hbmImage, IntPtr hbmMask, ref int pi);
        int ReplaceIcon(int i, IntPtr hicon, ref int pi);
        int SetOverlayImage(int iImage, int iOverlay);
        int Replace(int i, IntPtr hbmImage, IntPtr hbmMask);
        int AddMasked(IntPtr hbmImage, int crMask, ref int pi);
        int Draw(ref IMAGELISTDRAWPARAMS pimldp);
        int Remove(int i);
        int GetIcon(int i, int flags, ref IntPtr picon);
    }}

    [StructLayout(LayoutKind.Sequential)]
    private struct IMAGELISTDRAWPARAMS {{
        public int cbSize;
    }}

    public static Icon GetLargeIcon(string path) {{
        SHFILEINFO shfi = new SHFILEINFO();
        SHGetFileInfo(path, 0, ref shfi, (uint)Marshal.SizeOf(shfi), SHGFI_SYSICONINDEX);

        Guid iidImageList = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");
        IImageList imgList;

        // Try jumbo (256x256) first
        if (SHGetImageList(SHIL_JUMBO, ref iidImageList, out imgList) == 0) {{
            IntPtr hIcon = IntPtr.Zero;
            imgList.GetIcon(shfi.iIcon, 0, ref hIcon);
            if (hIcon != IntPtr.Zero) {{
                Icon icon = (Icon)Icon.FromHandle(hIcon).Clone();
                DestroyIcon(hIcon);
                return icon;
            }}
        }}

        // Fallback to extra large (48x48)
        if (SHGetImageList(SHIL_EXTRALARGE, ref iidImageList, out imgList) == 0) {{
            IntPtr hIcon = IntPtr.Zero;
            imgList.GetIcon(shfi.iIcon, 0, ref hIcon);
            if (hIcon != IntPtr.Zero) {{
                Icon icon = (Icon)Icon.FromHandle(hIcon).Clone();
                DestroyIcon(hIcon);
                return icon;
            }}
        }}

        return null;
    }}
}}
'@ -ReferencedAssemblies System.Drawing

$icon = [IconExtractor]::GetLargeIcon('{0}')
if ($icon) {{
    $bmp = $icon.ToBitmap()
    $bmp.Save('{1}', [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $icon.Dispose()
}} else {{
    Add-Type -AssemblyName System.Drawing
    $i = [System.Drawing.Icon]::ExtractAssociatedIcon('{0}')
    if ($i) {{ $i.ToBitmap().Save('{1}', [System.Drawing.Imaging.ImageFormat]::Png) }}
}}
"#,
        exe_path_str.replace("'", "''"),
        output_path_str.replace("'", "''")
    );

    let result = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match result {
        Ok(output) => {
            if output.status.success() && output_path.exists() {
                Some(output_path_str.to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if !stderr.is_empty() {
                    eprintln!("[Icon Extractor] Advanced method failed: {}", stderr);
                }
                None
            }
        }
        Err(e) => {
            eprintln!("[Icon Extractor] PowerShell execution failed: {}", e);
            None
        }
    }
}

#[cfg(not(windows))]
pub fn extract_icon_from_exe(_exe_path: &Path, _output_dir: &Path) -> Option<String> {
    None
}

/// Get the icon cache directory
pub fn get_icon_cache_dir() -> Option<std::path::PathBuf> {
    dirs::data_local_dir().map(|p| p.join("Atlas").join("icons"))
}

/// Download Steam game icon from Steam CDN (high resolution)
/// Returns the path to the saved icon file, or None if download failed
pub fn download_steam_icon(app_id: &str, output_dir: &std::path::Path) -> Option<String> {
    use std::fs;
    use std::io::Write;

    // Ensure output directory exists
    fs::create_dir_all(output_dir).ok()?;

    let output_path = output_dir.join(format!("steam_{}.jpg", app_id));

    // If icon already exists, return it
    if output_path.exists() {
        return Some(output_path.to_string_lossy().to_string());
    }

    // Steam CDN URLs for game artwork (in order of preference)
    // library_600x900.jpg - Portrait art (best for game cards)
    // header.jpg - 460x215 header image
    // capsule_616x353.jpg - Capsule art
    let urls = [
        format!("https://steamcdn-a.akamaihd.net/steam/apps/{}/library_600x900.jpg", app_id),
        format!("https://steamcdn-a.akamaihd.net/steam/apps/{}/header.jpg", app_id),
        format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900.jpg", app_id),
        format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg", app_id),
    ];

    for url in &urls {
        if let Ok(response) = ureq::get(url).call() {
            if response.status() == 200 {
                let mut bytes = Vec::new();
                if response.into_reader().read_to_end(&mut bytes).is_ok() && !bytes.is_empty() {
                    if let Ok(mut file) = fs::File::create(&output_path) {
                        if file.write_all(&bytes).is_ok() {
                            return Some(output_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

/// Download HoYoPlay game icon from official sources (high resolution)
/// Returns the path to the saved icon file, or None if download failed
pub fn download_hoyoplay_icon(game_id: &str, output_dir: &std::path::Path) -> Option<String> {
    use std::fs;
    use std::io::Write;

    // Ensure output directory exists
    fs::create_dir_all(output_dir).ok()?;

    let output_path = output_dir.join(format!("hoyoplay_{}.png", game_id));

    // If icon already exists, return it
    if output_path.exists() {
        return Some(output_path.to_string_lossy().to_string());
    }

    // HoYoverse official game artwork URLs
    // These are high-resolution promotional images from HoYoverse's CDN
    let urls: Vec<&str> = match game_id.to_lowercase().as_str() {
        "genshin impact" | "genshinimpact" => vec![
            "https://fastcdn.hoyoverse.com/static-resource-v2/2024/04/12/b700cce2ac4c68a520b15cafa86a03f0_2812106824379931937.png",
            "https://upload-os-bbs.hoyolab.com/upload/2024/08/22/8a13f3c56aba72fac5fb44be1cd7aaef_5009769891621992689.png",
            "https://webstatic.hoyoverse.com/upload/static-resource/2022/08/12/5c6c4f7e57278a6c951abc0b0c22bc75_6817032825676431226.png",
        ],
        "star rail" | "honkai: star rail" | "honkaistarrail" => vec![
            "https://fastcdn.hoyoverse.com/static-resource-v2/2024/04/12/fad73d0538ef8c5a3ce5f4128266d6df_5765815593498505630.png",
            "https://upload-os-bbs.hoyolab.com/upload/2024/04/23/d7b36ee0e5d4f8c098e3cf1bd5e4ebf9_6932936853015920268.png",
            "https://webstatic.hoyoverse.com/upload/static-resource/2023/04/13/aa7e9cd6cd92cd26fa1c21432c2f2f16_8927091498918268532.png",
        ],
        "zenless zone zero" | "zenlesszonezero" | "zzz" => vec![
            "https://fastcdn.hoyoverse.com/static-resource-v2/2024/07/04/8d0fc49a4e5b28c99cc2c6d43b3c82b8_4685458561664829498.png",
            "https://upload-os-bbs.hoyolab.com/upload/2024/07/04/e3e28e0d16e0d26d86ef6e7c9a6c3899_1953903133089889869.png",
            "https://webstatic.hoyoverse.com/upload/static-resource/2024/06/28/00b5fb34ed0d2a5d75e1ade9c7c24ab1_8682823461979880215.png",
        ],
        "honkai impact 3rd" | "honkaiimpact3rd" | "honkai impact 3" | "hi3" => vec![
            "https://fastcdn.hoyoverse.com/static-resource-v2/2023/11/09/53c0dba0fa55e81b32b4401392c04fc0_6067865547267062507.png",
            "https://upload-os-bbs.hoyolab.com/upload/2023/11/08/8f8f7fd1aa55e2ad0e3ad4f5b7ac7e9c_3831009693156665298.png",
            "https://webstatic.hoyoverse.com/upload/static-resource/2021/06/04/11ac6ccb95d1648be3ad33b4f61e968c_2608962932232290879.png",
        ],
        _ => return None,
    };

    for url in urls {
        if let Ok(response) = ureq::get(url).call() {
            if response.status() == 200 {
                // Verify content type is an image
                let content_type = response.header("content-type").unwrap_or("");
                if !content_type.starts_with("image/") {
                    continue; // Skip non-image responses
                }

                let mut bytes = Vec::new();
                if response.into_reader().read_to_end(&mut bytes).is_ok() && !bytes.is_empty() {
                    // Basic validation: PNG starts with 0x89504E47, JPEG with 0xFFD8
                    let is_valid_image = bytes.len() > 8 && (
                        (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) || // PNG
                        (bytes[0] == 0xFF && bytes[1] == 0xD8) // JPEG
                    );

                    if is_valid_image {
                        if let Ok(mut file) = fs::File::create(&output_path) {
                            if file.write_all(&bytes).is_ok() {
                                return Some(output_path.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// Download Riot game icon from official sources (high resolution)
/// Returns the path to the saved icon file, or None if download failed
pub fn download_riot_icon(game_id: &str, output_dir: &std::path::Path) -> Option<String> {
    use std::fs;
    use std::io::Write;

    // Ensure output directory exists
    fs::create_dir_all(output_dir).ok()?;

    let output_path = output_dir.join(format!("riot_{}.png", game_id));

    // If icon already exists, return it
    if output_path.exists() {
        return Some(output_path.to_string_lossy().to_string());
    }

    // Riot Games official artwork URLs
    // Using reliable CDN sources with verified image content
    let urls: Vec<&str> = match game_id.to_lowercase().as_str() {
        "valorant" => vec![
            // Valorant official images from playvalorant.com and Riot CDN
            "https://trackercdn.com/cdn/tracker.gg/valorant/db/icons/valorant-icon.png",
            "https://blitz-cdn.blitz.gg/blitz/val/icons/logo-valorant.png",
            "https://s3.us-west-2.amazonaws.com/tracker-assets/paper/assets/static/img/valorant/icons/icon-valorant.png",
        ],
        "league_of_legends" | "league of legends" | "lol" => vec![
            "https://trackercdn.com/cdn/tracker.gg/lol/icons/lol-icon.png",
            "https://blitz-cdn.blitz.gg/blitz/lol/icons/logo-lol.png",
            "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lux_0.jpg",
        ],
        "legends of runeterra" | "lor" | "bacon" => vec![
            "https://trackercdn.com/cdn/tracker.gg/lor/icons/lor-icon.png",
            "https://blitz-cdn.blitz.gg/blitz/lor/icons/logo-lor.png",
        ],
        _ => return None,
    };

    for url in urls {
        if let Ok(response) = ureq::get(url).call() {
            if response.status() == 200 {
                // Verify content type is an image
                let content_type = response.header("content-type").unwrap_or("");
                if !content_type.starts_with("image/") {
                    continue; // Skip non-image responses
                }

                let mut bytes = Vec::new();
                if response.into_reader().read_to_end(&mut bytes).is_ok() && !bytes.is_empty() {
                    // Basic validation: PNG starts with 0x89504E47, JPEG with 0xFFD8
                    let is_valid_image = bytes.len() > 8 && (
                        (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) || // PNG
                        (bytes[0] == 0xFF && bytes[1] == 0xD8) // JPEG
                    );

                    if is_valid_image {
                        if let Ok(mut file) = fs::File::create(&output_path) {
                            if file.write_all(&bytes).is_ok() {
                                return Some(output_path.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}
