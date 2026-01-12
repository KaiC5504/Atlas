// Icon extractor for game executables
// Extracts icons from .exe files on Windows using PowerShell

use std::io::Read;
use std::path::Path;
use std::process::Command;

/// Extract icon from an executable and save it as PNG (256x256 HD)
/// Returns the path to the saved icon file, or None if extraction failed
#[cfg(windows)]
pub fn extract_icon_from_exe(exe_path: &Path, output_dir: &Path) -> Option<String> {
    use std::fs;

    // Ensure output directory exists
    fs::create_dir_all(output_dir).ok()?;

    // Generate output filename based on exe name
    let exe_name = exe_path.file_stem()?.to_string_lossy().to_string();
    let output_path = output_dir.join(format!("{}.png", exe_name));

    // If icon already exists, return it
    if output_path.exists() {
        return Some(output_path.to_string_lossy().to_string());
    }

    let exe_path_str = exe_path.to_string_lossy().to_string();
    let output_path_str = output_path.to_string_lossy().to_string();

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
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .output();

    match result {
        Ok(output) => {
            if output.status.success() && output_path.exists() {
                Some(output_path_str)
            } else {
                None
            }
        }
        Err(_) => None,
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
