use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ProcessDescription {
    pub friendly_name: &'static str,
    pub description: &'static str,
    pub impact_if_killed: &'static str,
    pub respawns: bool,
    pub respawn_when: Option<&'static str>,
}

static PROCESS_DESCRIPTIONS: OnceLock<HashMap<&'static str, ProcessDescription>> = OnceLock::new();

fn get_descriptions() -> &'static HashMap<&'static str, ProcessDescription> {
    PROCESS_DESCRIPTIONS.get_or_init(|| {
        let mut map = HashMap::new();

        // Anti-cheat (Protected)
        map.insert(
            "vgc.exe",
            ProcessDescription {
                friendly_name: "Vanguard Client",
                description: "Anti-cheat kernel driver",
                impact_if_killed: "PROTECTED - Cannot play Valorant without this",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "vgtray.exe",
            ProcessDescription {
                friendly_name: "Vanguard Tray",
                description: "Vanguard tray icon",
                impact_if_killed: "PROTECTED - Vanguard interface",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );

        // Microsoft Bloat
        map.insert(
            "msedge.exe",
            ProcessDescription {
                friendly_name: "Microsoft Edge",
                description: "Microsoft web browser",
                impact_if_killed: "Closes Edge browser tabs",
                respawns: true,
                respawn_when: Some("Opening links or Windows features"),
            },
        );
        map.insert(
            "searchindexer.exe",
            ProcessDescription {
                friendly_name: "Windows Search",
                description: "File search indexer",
                impact_if_killed: "Search will be slower",
                respawns: true,
                respawn_when: Some("Shortly after being killed"),
            },
        );
        map.insert(
            "cortana.exe",
            ProcessDescription {
                friendly_name: "Cortana",
                description: "Microsoft virtual assistant",
                impact_if_killed: "Cortana features unavailable",
                respawns: true,
                respawn_when: Some("Opening Start menu"),
            },
        );
        map.insert(
            "searchapp.exe",
            ProcessDescription {
                friendly_name: "Windows Search App",
                description: "Taskbar search interface",
                impact_if_killed: "Search box temporarily unavailable",
                respawns: true,
                respawn_when: Some("Clicking search"),
            },
        );
        map.insert(
            "onedrive.exe",
            ProcessDescription {
                friendly_name: "OneDrive",
                description: "Cloud storage sync",
                impact_if_killed: "Cloud sync paused",
                respawns: true,
                respawn_when: Some("User login"),
            },
        );
        map.insert(
            "yourphone.exe",
            ProcessDescription {
                friendly_name: "Phone Link",
                description: "Phone sync app",
                impact_if_killed: "Phone notifications stop",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "gamebar.exe",
            ProcessDescription {
                friendly_name: "Xbox Game Bar",
                description: "Gaming overlay recorder",
                impact_if_killed: "Win+G overlay unavailable",
                respawns: true,
                respawn_when: Some("Pressing Win+G"),
            },
        );
        map.insert(
            "widgets.exe",
            ProcessDescription {
                friendly_name: "Windows Widgets",
                description: "News widgets panel",
                impact_if_killed: "Widget panel unavailable",
                respawns: true,
                respawn_when: Some("Opening widget panel"),
            },
        );
        map.insert(
            "msteams.exe",
            ProcessDescription {
                friendly_name: "Microsoft Teams",
                description: "Chat meeting app",
                impact_if_killed: "Teams calls/chat stop",
                respawns: false,
                respawn_when: None,
            },
        );

        // Security Software (Warning)
        map.insert(
            "msmpeng.exe",
            ProcessDescription {
                friendly_name: "Windows Defender",
                description: "Antivirus protection service",
                impact_if_killed: "SECURITY - Real-time protection off",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "securityhealthservice.exe",
            ProcessDescription {
                friendly_name: "Windows Security",
                description: "Security health monitor",
                impact_if_killed: "SECURITY - Health monitoring off",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );

        // User Applications
        map.insert(
            "chrome.exe",
            ProcessDescription {
                friendly_name: "Google Chrome",
                description: "Google web browser",
                impact_if_killed: "Closes all Chrome tabs",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "firefox.exe",
            ProcessDescription {
                friendly_name: "Mozilla Firefox",
                description: "Mozilla web browser",
                impact_if_killed: "Closes all Firefox tabs",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "discord.exe",
            ProcessDescription {
                friendly_name: "Discord",
                description: "Voice text chat",
                impact_if_killed: "Disconnects from voice/chat",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "spotify.exe",
            ProcessDescription {
                friendly_name: "Spotify",
                description: "Music streaming app",
                impact_if_killed: "Music stops playing",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "steam.exe",
            ProcessDescription {
                friendly_name: "Steam",
                description: "Valve gaming platform",
                impact_if_killed: "Can't launch Steam games",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "steamwebhelper.exe",
            ProcessDescription {
                friendly_name: "Steam WebHelper",
                description: "Steam web browser",
                impact_if_killed: "Steam store/community unavailable",
                respawns: true,
                respawn_when: Some("Opening Steam browser features"),
            },
        );
        map.insert(
            "epicgameslauncher.exe",
            ProcessDescription {
                friendly_name: "Epic Games Launcher",
                description: "Epic gaming platform",
                impact_if_killed: "Can't launch Epic games",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "slack.exe",
            ProcessDescription {
                friendly_name: "Slack",
                description: "Team communication app",
                impact_if_killed: "Disconnects from workspace",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "code.exe",
            ProcessDescription {
                friendly_name: "Visual Studio Code",
                description: "Microsoft code editor",
                impact_if_killed: "Closes editor, may lose unsaved work",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "obs64.exe",
            ProcessDescription {
                friendly_name: "OBS Studio",
                description: "Streaming recording software",
                impact_if_killed: "Stops recording/streaming",
                respawns: false,
                respawn_when: None,
            },
        );

        // System Critical (Cannot kill)
        map.insert(
            "csrss.exe",
            ProcessDescription {
                friendly_name: "Client Server Runtime",
                description: "Critical Windows subsystem",
                impact_if_killed: "CRITICAL - System crash (BSOD)",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "lsass.exe",
            ProcessDescription {
                friendly_name: "Local Security Authority",
                description: "Security policies handler",
                impact_if_killed: "CRITICAL - System crash",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "svchost.exe",
            ProcessDescription {
                friendly_name: "Service Host",
                description: "Windows service host",
                impact_if_killed: "CRITICAL - System instability",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "dwm.exe",
            ProcessDescription {
                friendly_name: "Desktop Window Manager",
                description: "Visual effects manager",
                impact_if_killed: "CRITICAL - Display issues, restarts immediately",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "explorer.exe",
            ProcessDescription {
                friendly_name: "Windows Explorer",
                description: "Desktop taskbar shell",
                impact_if_killed: "Taskbar disappears, restarts",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );

        // Background Services
        map.insert(
            "backgroundtaskhost.exe",
            ProcessDescription {
                friendly_name: "Background Tasks",
                description: "Background operations host",
                impact_if_killed: "Some apps may malfunction",
                respawns: true,
                respawn_when: Some("When needed"),
            },
        );
        map.insert(
            "compattelrunner.exe",
            ProcessDescription {
                friendly_name: "Compatibility Telemetry",
                description: "Microsoft diagnostic telemetry",
                impact_if_killed: "No immediate impact, saves resources",
                respawns: true,
                respawn_when: Some("Scheduled task"),
            },
        );
        map.insert(
            "smartscreen.exe",
            ProcessDescription {
                friendly_name: "SmartScreen",
                description: "App reputation checker",
                impact_if_killed: "Download warnings may not appear",
                respawns: true,
                respawn_when: Some("When downloading files"),
            },
        );

        // Drivers/Hardware
        map.insert(
            "nvcontainer.exe",
            ProcessDescription {
                friendly_name: "NVIDIA Container",
                description: "NVIDIA driver services",
                impact_if_killed: "NVIDIA features may not work",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "audiodg.exe",
            ProcessDescription {
                friendly_name: "Windows Audio Device",
                description: "Audio processing engine",
                impact_if_killed: "Sound stops working temporarily",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );

        // ===== System Critical (Additional) =====
        map.insert(
            "lsaiso.exe",
            ProcessDescription {
                friendly_name: "LSA Isolated",
                description: "Credential Guard isolation",
                impact_if_killed: "CRITICAL - Cannot kill, security isolation process",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "secure system",
            ProcessDescription {
                friendly_name: "Secure System",
                description: "Secure kernel VBS",
                impact_if_killed: "CRITICAL - Cannot kill, system security process",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "idle",
            ProcessDescription {
                friendly_name: "System Idle",
                description: "Idle CPU time",
                impact_if_killed: "CRITICAL - Cannot kill, kernel process",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "ngciso.exe",
            ProcessDescription {
                friendly_name: "NGC Isolated",
                description: "Windows Hello credentials",
                impact_if_killed: "CRITICAL - Windows Hello/PIN may fail",
                respawns: true,
                respawn_when: Some("When using Windows Hello"),
            },
        );

        // ===== Intel Services =====
        map.insert(
            "intelaudioservice.exe",
            ProcessDescription {
                friendly_name: "Intel Smart Sound",
                description: "Audio processing service",
                impact_if_killed: "Audio enhancements may not work",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "intel_pie_service.exe",
            ProcessDescription {
                friendly_name: "Intel PIE Service",
                description: "Platform innovation engine",
                impact_if_killed: "Intel platform features may not work",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "intelcphdcpsvc.exe",
            ProcessDescription {
                friendly_name: "Intel HDCP Service",
                description: "DRM content protection",
                impact_if_killed: "Protected video playback may fail",
                respawns: true,
                respawn_when: Some("When playing protected content"),
            },
        );
        map.insert(
            "oneapp.igcc.winservice.exe",
            ProcessDescription {
                friendly_name: "Intel Arc Control",
                description: "Graphics command center",
                impact_if_killed: "Intel graphics settings unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "igfxem.exe",
            ProcessDescription {
                friendly_name: "Intel Graphics Module",
                description: "Graphics executable module",
                impact_if_killed: "Intel display features may not work",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "jhi_service.exe",
            ProcessDescription {
                friendly_name: "Intel DAL Service",
                description: "Trusted app loader",
                impact_if_killed: "Intel security features may not work",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "esrv_svc.exe",
            ProcessDescription {
                friendly_name: "Intel Energy Server",
                description: "Power management SDK",
                impact_if_killed: "Power management features reduced",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );

        // ===== ASUS Services =====
        map.insert(
            "asusnumpadservice.exe",
            ProcessDescription {
                friendly_name: "ASUS NumberPad",
                description: "NumberPad touchpad service",
                impact_if_killed: "NumberPad on touchpad won't work",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "glidexservice.exe",
            ProcessDescription {
                friendly_name: "ASUS GlideX",
                description: "Cross-device screen sharing",
                impact_if_killed: "GlideX features unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "glidexserviceext.exe",
            ProcessDescription {
                friendly_name: "ASUS GlideX Extension",
                description: "GlideX extended features",
                impact_if_killed: "GlideX extended features unavailable",
                respawns: true,
                respawn_when: Some("When GlideX runs"),
            },
        );
        map.insert(
            "glidexremoteservice.exe",
            ProcessDescription {
                friendly_name: "ASUS GlideX Remote",
                description: "Remote connection service",
                impact_if_killed: "Remote screen sharing unavailable",
                respawns: true,
                respawn_when: Some("When GlideX runs"),
            },
        );
        map.insert(
            "glidexnearservice.exe",
            ProcessDescription {
                friendly_name: "ASUS GlideX Near",
                description: "Nearby device discovery",
                impact_if_killed: "Device discovery unavailable",
                respawns: true,
                respawn_when: Some("When GlideX runs"),
            },
        );
        map.insert(
            "rogliveservice.exe",
            ProcessDescription {
                friendly_name: "ASUS ROG Live",
                description: "ROG monitoring control",
                impact_if_killed: "ROG features unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "armourycrate.service.exe",
            ProcessDescription {
                friendly_name: "ASUS Armoury Crate",
                description: "System control RGB",
                impact_if_killed: "ASUS system controls unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "lightingservice.exe",
            ProcessDescription {
                friendly_name: "ASUS Aura Sync",
                description: "RGB lighting control",
                impact_if_killed: "RGB lighting control unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "aborcontrolservice.exe",
            ProcessDescription {
                friendly_name: "ASUS ABOR Control",
                description: "BIOS option router",
                impact_if_killed: "ASUS BIOS control unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "asusoptimization.exe",
            ProcessDescription {
                friendly_name: "ASUS Optimization",
                description: "System optimization service",
                impact_if_killed: "ASUS optimizations paused",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "asuslinksvc.exe",
            ProcessDescription {
                friendly_name: "ASUS Link Service",
                description: "Cross-device communication service",
                impact_if_killed: "ASUS Link features unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );

        // ===== Audio Services =====
        map.insert(
            "dax3api.exe",
            ProcessDescription {
                friendly_name: "Dolby Atmos",
                description: "Audio enhancement API",
                impact_if_killed: "Dolby Audio enhancements disabled",
                respawns: true,
                respawn_when: Some("When audio plays"),
            },
        );
        map.insert(
            "rtkauduservice64.exe",
            ProcessDescription {
                friendly_name: "Realtek HD Audio",
                description: "HD audio processing",
                impact_if_killed: "Realtek audio features disabled",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "nahimicservice.exe",
            ProcessDescription {
                friendly_name: "Nahimic Service",
                description: "3D surround sound",
                impact_if_killed: "Gaming audio enhancements disabled",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );

        // ===== Windows Shell & UWP Processes =====
        map.insert(
            "applicationframehost.exe",
            ProcessDescription {
                friendly_name: "App Frame Host",
                description: "UWP window frames",
                impact_if_killed: "UWP apps may crash",
                respawns: true,
                respawn_when: Some("When opening UWP apps"),
            },
        );
        map.insert(
            "shellexperiencehost.exe",
            ProcessDescription {
                friendly_name: "Shell Experience Host",
                description: "Shell visual elements",
                impact_if_killed: "Start menu may temporarily freeze",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "textinputhost.exe",
            ProcessDescription {
                friendly_name: "Text Input Host",
                description: "Text input manager",
                impact_if_killed: "Text input features temporarily unavailable",
                respawns: true,
                respawn_when: Some("When typing"),
            },
        );
        map.insert(
            "searchhost.exe",
            ProcessDescription {
                friendly_name: "Windows Search Host",
                description: "Search indexing host",
                impact_if_killed: "Search temporarily unavailable",
                respawns: true,
                respawn_when: Some("When opening search"),
            },
        );
        map.insert(
            "lockapp.exe",
            ProcessDescription {
                friendly_name: "Lock Screen App",
                description: "Lock screen interface",
                impact_if_killed: "Lock screen may look different",
                respawns: true,
                respawn_when: Some("When locking PC"),
            },
        );
        map.insert(
            "shellhost.exe",
            ProcessDescription {
                friendly_name: "Shell Host",
                description: "Shell infrastructure host",
                impact_if_killed: "Shell features may malfunction",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "systemsettings.exe",
            ProcessDescription {
                friendly_name: "System Settings",
                description: "Windows Settings app",
                impact_if_killed: "Settings app closes",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "chsime.exe",
            ProcessDescription {
                friendly_name: "Chinese IME",
                description: "Chinese input method",
                impact_if_killed: "Chinese input unavailable",
                respawns: true,
                respawn_when: Some("When switching to Chinese input"),
            },
        );
        map.insert(
            "unsecapp.exe",
            ProcessDescription {
                friendly_name: "WMI Unsecured App",
                description: "WMI async callback",
                impact_if_killed: "Some system queries may fail",
                respawns: true,
                respawn_when: Some("When needed"),
            },
        );
        map.insert(
            "aggregatorhost.exe",
            ProcessDescription {
                friendly_name: "Aggregator Host",
                description: "Telemetry diagnostic aggregation",
                impact_if_killed: "Some diagnostics paused",
                respawns: true,
                respawn_when: Some("Scheduled"),
            },
        );

        // ===== Gaming Services =====
        map.insert(
            "gamingservices.exe",
            ProcessDescription {
                friendly_name: "Xbox Game Services",
                description: "Xbox Game Pass",
                impact_if_killed: "Xbox/Game Pass features unavailable",
                respawns: true,
                respawn_when: Some("When launching games"),
            },
        );
        map.insert(
            "gamingservicesnet.exe",
            ProcessDescription {
                friendly_name: "Gaming Services Network",
                description: "Xbox Live network",
                impact_if_killed: "Xbox Live features unavailable",
                respawns: true,
                respawn_when: Some("When using Xbox features"),
            },
        );
        map.insert(
            "gameinputredistservice.exe",
            ProcessDescription {
                friendly_name: "Game Input Service",
                description: "Controller input API",
                impact_if_killed: "Game controller input may fail",
                respawns: true,
                respawn_when: Some("When using controllers"),
            },
        );
        map.insert(
            "gamesdk.exe",
            ProcessDescription {
                friendly_name: "Game SDK",
                description: "Game SDK runtime",
                impact_if_killed: "Some game features unavailable",
                respawns: true,
                respawn_when: Some("When launching games"),
            },
        );
        map.insert(
            "presentmonservice.exe",
            ProcessDescription {
                friendly_name: "PresentMon Service",
                description: "GPU performance monitor",
                impact_if_killed: "Performance overlay unavailable",
                respawns: false,
                respawn_when: None,
            },
        );

        // ===== User Applications (Development) =====
        map.insert(
            "atlas.exe",
            ProcessDescription {
                friendly_name: "Atlas",
                description: "Atlas desktop app",
                impact_if_killed: "This application closes",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "python.exe",
            ProcessDescription {
                friendly_name: "Python",
                description: "Python script interpreter",
                impact_if_killed: "Python scripts stop running",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "pythonw.exe",
            ProcessDescription {
                friendly_name: "Python (Windowed)",
                description: "Python GUI apps",
                impact_if_killed: "Python GUI apps stop running",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "claude.exe",
            ProcessDescription {
                friendly_name: "Claude Code",
                description: "AI coding assistant",
                impact_if_killed: "Claude session ends",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "cargo.exe",
            ProcessDescription {
                friendly_name: "Cargo",
                description: "Rust package manager",
                impact_if_killed: "Rust build process stops",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "esbuild.exe",
            ProcessDescription {
                friendly_name: "esbuild",
                description: "Fast JavaScript bundler",
                impact_if_killed: "JS bundling stops",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "uv.exe",
            ProcessDescription {
                friendly_name: "uv",
                description: "Python package installer",
                impact_if_killed: "Package installation stops",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "ghelper.exe",
            ProcessDescription {
                friendly_name: "G-Helper",
                description: "ASUS laptop control",
                impact_if_killed: "G-Helper controls unavailable",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "cmd.exe",
            ProcessDescription {
                friendly_name: "Command Prompt",
                description: "Command line terminal",
                impact_if_killed: "Terminal session ends",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "powershell.exe",
            ProcessDescription {
                friendly_name: "Windows PowerShell",
                description: "PowerShell scripting terminal",
                impact_if_killed: "PowerShell session ends",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "pwsh.exe",
            ProcessDescription {
                friendly_name: "PowerShell 7",
                description: "Cross-platform PowerShell",
                impact_if_killed: "PowerShell session ends",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "node.exe",
            ProcessDescription {
                friendly_name: "Node.js",
                description: "JavaScript runtime environment",
                impact_if_killed: "Node.js applications stop",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "aria2c.exe",
            ProcessDescription {
                friendly_name: "aria2",
                description: "Download utility tool",
                impact_if_killed: "Downloads stop",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "git.exe",
            ProcessDescription {
                friendly_name: "Git",
                description: "Version control system",
                impact_if_killed: "Git operation stops",
                respawns: false,
                respawn_when: None,
            },
        );

        // ===== Third-party Services =====
        map.insert(
            "mdnsresponder.exe",
            ProcessDescription {
                friendly_name: "Apple Bonjour",
                description: "Network service discovery",
                impact_if_killed: "Network device discovery may fail",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "applemobiledeviceservice.exe",
            ProcessDescription {
                friendly_name: "Apple Mobile Devices",
                description: "iPhone iPad sync",
                impact_if_killed: "iTunes/iPhone sync unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "teamviewer_service.exe",
            ProcessDescription {
                friendly_name: "TeamViewer",
                description: "Remote desktop service",
                impact_if_killed: "TeamViewer connections unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "logi_lamparray_service.exe",
            ProcessDescription {
                friendly_name: "Logitech G HUB",
                description: "RGB lighting sync",
                impact_if_killed: "Logitech RGB sync unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "collector_service.exe",
            ProcessDescription {
                friendly_name: "Collector Service",
                description: "Data collection service",
                impact_if_killed: "Data collection paused",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "telemetry_agent.exe",
            ProcessDescription {
                friendly_name: "Telemetry Agent",
                description: "Telemetry data collector",
                impact_if_killed: "Telemetry paused",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );

        // ===== Security (Additional) =====
        map.insert(
            "mpdefendercoreservice.exe",
            ProcessDescription {
                friendly_name: "Defender Core Service",
                description: "Core protection service",
                impact_if_killed: "SECURITY - Real-time protection reduced",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );

        // ===== Microsoft Office =====
        map.insert(
            "officeclicktorun.exe",
            ProcessDescription {
                friendly_name: "Microsoft Office",
                description: "Office update service",
                impact_if_killed: "Office updates paused",
                respawns: true,
                respawn_when: Some("When using Office apps"),
            },
        );

        // ===== Thunderbolt =====
        map.insert(
            "thunderboltservice.exe",
            ProcessDescription {
                friendly_name: "Thunderbolt Service",
                description: "Thunderbolt connection manager",
                impact_if_killed: "Thunderbolt devices may not work",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );

        // ===== Cross-Device =====
        map.insert(
            "crossdeviceresume.exe",
            ProcessDescription {
                friendly_name: "Cross Device Resume",
                description: "Cross-device experience sync",
                impact_if_killed: "Cross-device features unavailable",
                respawns: true,
                respawn_when: Some("When using cross-device features"),
            },
        );

        // ===== WebView2 (Critical for apps) =====
        map.insert(
            "msedgewebview2.exe",
            ProcessDescription {
                friendly_name: "Microsoft WebView2",
                description: "WebView2 app runtime",
                impact_if_killed: "CRITICAL - Apps using WebView2 will crash (white screen)",
                respawns: true,
                respawn_when: Some("When apps using WebView2 start"),
            },
        );

        // ===== Windows System Processes (Missing) =====
        map.insert(
            "taskmgr.exe",
            ProcessDescription {
                friendly_name: "Task Manager",
                description: "Windows process manager",
                impact_if_killed: "Task Manager closes",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "startmenuexperiencehost.exe",
            ProcessDescription {
                friendly_name: "Start Menu",
                description: "Windows Start menu",
                impact_if_killed: "Start menu temporarily unavailable",
                respawns: true,
                respawn_when: Some("When opening Start"),
            },
        );
        map.insert(
            "vctip.exe",
            ProcessDescription {
                friendly_name: "VC++ Telemetry",
                description: "Visual C++ telemetry",
                impact_if_killed: "No immediate impact",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "runtimebroker.exe",
            ProcessDescription {
                friendly_name: "Runtime Broker",
                description: "App permission manager",
                impact_if_killed: "UWP apps may crash",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "conhost.exe",
            ProcessDescription {
                friendly_name: "Console Host",
                description: "Console window host",
                impact_if_killed: "Terminal windows close",
                respawns: true,
                respawn_when: Some("When opening terminals"),
            },
        );
        map.insert(
            "sihost.exe",
            ProcessDescription {
                friendly_name: "Shell Infrastructure",
                description: "Shell infrastructure host",
                impact_if_killed: "Shell features may break",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "ctfmon.exe",
            ProcessDescription {
                friendly_name: "CTF Loader",
                description: "Text input services",
                impact_if_killed: "Language bar unavailable",
                respawns: true,
                respawn_when: Some("When typing"),
            },
        );
        map.insert(
            "taskhostw.exe",
            ProcessDescription {
                friendly_name: "Task Host",
                description: "Background task host",
                impact_if_killed: "Scheduled tasks interrupted",
                respawns: true,
                respawn_when: Some("When needed"),
            },
        );
        map.insert(
            "wudfhost.exe",
            ProcessDescription {
                friendly_name: "Driver Framework",
                description: "User-mode driver host",
                impact_if_killed: "Some drivers may fail",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "wmiprvse.exe",
            ProcessDescription {
                friendly_name: "WMI Provider",
                description: "WMI provider host",
                impact_if_killed: "System queries may fail",
                respawns: true,
                respawn_when: Some("When needed"),
            },
        );
        map.insert(
            "winlogon.exe",
            ProcessDescription {
                friendly_name: "Windows Logon",
                description: "Logon session manager",
                impact_if_killed: "CRITICAL - System crash",
                respawns: false,
                respawn_when: None,
            },
        );
        map.insert(
            "dashost.exe",
            ProcessDescription {
                friendly_name: "Device Association",
                description: "Device pairing host",
                impact_if_killed: "Device pairing unavailable",
                respawns: true,
                respawn_when: Some("When pairing devices"),
            },
        );
        map.insert(
            "fontdrvhost.exe",
            ProcessDescription {
                friendly_name: "Font Driver",
                description: "Font rendering host",
                impact_if_killed: "Font rendering issues",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "spoolsv.exe",
            ProcessDescription {
                friendly_name: "Print Spooler",
                description: "Print queue manager",
                impact_if_killed: "Printing unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "wlanext.exe",
            ProcessDescription {
                friendly_name: "WLAN Extension",
                description: "Wireless LAN service",
                impact_if_killed: "WiFi features reduced",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "widgetservice.exe",
            ProcessDescription {
                friendly_name: "Widget Service",
                description: "Windows widgets backend",
                impact_if_killed: "Widgets unavailable",
                respawns: true,
                respawn_when: Some("When opening widgets"),
            },
        );
        map.insert(
            "securityhealthsystray.exe",
            ProcessDescription {
                friendly_name: "Security Tray",
                description: "Windows Security tray",
                impact_if_killed: "Security icon disappears",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );

        // ===== NVIDIA Processes =====
        map.insert(
            "nvdisplay.container.exe",
            ProcessDescription {
                friendly_name: "NVIDIA Display",
                description: "NVIDIA display service",
                impact_if_killed: "Display settings unavailable",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "nvidia overlay.exe",
            ProcessDescription {
                friendly_name: "NVIDIA Overlay",
                description: "GeForce Experience overlay",
                impact_if_killed: "NVIDIA overlay unavailable",
                respawns: true,
                respawn_when: Some("When gaming"),
            },
        );
        map.insert(
            "nvsphelper64.exe",
            ProcessDescription {
                friendly_name: "NVIDIA Share",
                description: "NVIDIA sharing helper",
                impact_if_killed: "Screen sharing unavailable",
                respawns: true,
                respawn_when: Some("When sharing"),
            },
        );

        // ===== Intel Processes =====
        map.insert(
            "esrv.exe",
            ProcessDescription {
                friendly_name: "Intel Energy",
                description: "Power management service",
                impact_if_killed: "Power features reduced",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "intelgraphicssoftware.service.exe",
            ProcessDescription {
                friendly_name: "Intel Graphics",
                description: "Intel graphics service",
                impact_if_killed: "Graphics settings unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "ipf_helper.exe",
            ProcessDescription {
                friendly_name: "Intel Platform",
                description: "Platform framework helper",
                impact_if_killed: "Intel features reduced",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "ipfsvc.exe",
            ProcessDescription {
                friendly_name: "Intel Platform",
                description: "Platform framework service",
                impact_if_killed: "Intel features reduced",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );

        // ===== ASUS Processes =====
        map.insert(
            "asus_framework.exe",
            ProcessDescription {
                friendly_name: "ASUS Framework",
                description: "ASUS system framework",
                impact_if_killed: "ASUS features unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "aacambientlighting.exe",
            ProcessDescription {
                friendly_name: "ASUS Aura Lighting",
                description: "Ambient lighting control",
                impact_if_killed: "Ambient lighting stops",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "armourycrate.usersessionhelper.exe",
            ProcessDescription {
                friendly_name: "Armoury Crate Helper",
                description: "Armoury Crate session",
                impact_if_killed: "Armoury Crate features reduced",
                respawns: true,
                respawn_when: Some("When using Armoury Crate"),
            },
        );
        map.insert(
            "armourysocketserver.exe",
            ProcessDescription {
                friendly_name: "Armoury Socket",
                description: "Armoury Crate socket",
                impact_if_killed: "Armoury Crate communication stops",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "asusinputlocalemonitor.exe",
            ProcessDescription {
                friendly_name: "ASUS Input Monitor",
                description: "Input locale monitor",
                impact_if_killed: "Input features reduced",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "asussmartdisplaycontrol.exe",
            ProcessDescription {
                friendly_name: "ASUS Smart Display",
                description: "Smart display control",
                impact_if_killed: "Display features reduced",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "acpowernotification.exe",
            ProcessDescription {
                friendly_name: "AC Power Notify",
                description: "Power state notifications",
                impact_if_killed: "Power notifications stop",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "sursvc.exe",
            ProcessDescription {
                friendly_name: "ASUS Surface",
                description: "Surface device service",
                impact_if_killed: "Surface features unavailable",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );

        // ===== Riot Games =====
        map.insert(
            "riotclientservices.exe",
            ProcessDescription {
                friendly_name: "Riot Client",
                description: "Riot Games client",
                impact_if_killed: "PROTECTED - Riot games launcher",
                respawns: true,
                respawn_when: Some("When launching Riot games"),
            },
        );
        map.insert(
            "riotclientcrashhandler.exe",
            ProcessDescription {
                friendly_name: "Riot Crash Handler",
                description: "Riot crash reporter",
                impact_if_killed: "Crash reports unavailable",
                respawns: true,
                respawn_when: Some("When Riot client runs"),
            },
        );

        // ===== Other Apps =====
        map.insert(
            "onedrive.sync.service.exe",
            ProcessDescription {
                friendly_name: "OneDrive Sync",
                description: "OneDrive sync service",
                impact_if_killed: "Cloud sync paused",
                respawns: true,
                respawn_when: Some("When OneDrive runs"),
            },
        );
        map.insert(
            "nissrv.exe",
            ProcessDescription {
                friendly_name: "Defender Network",
                description: "Network inspection service",
                impact_if_killed: "SECURITY - Network protection reduced",
                respawns: true,
                respawn_when: Some("Immediately"),
            },
        );
        map.insert(
            "wmiregistrationservice.exe",
            ProcessDescription {
                friendly_name: "WMI Registration",
                description: "WMI registration service",
                impact_if_killed: "WMI features reduced",
                respawns: true,
                respawn_when: Some("System startup"),
            },
        );
        map.insert(
            "appactions.exe",
            ProcessDescription {
                friendly_name: "App Actions",
                description: "Windows app actions",
                impact_if_killed: "Some app features unavailable",
                respawns: true,
                respawn_when: Some("When needed"),
            },
        );

        map
    })
}

/// Get a description for a process by name
pub fn get_process_description(name: &str) -> Option<String> {
    let name_lower = name.to_lowercase();
    let descriptions = get_descriptions();

    // Try exact match first
    if let Some(desc) = descriptions.get(name_lower.as_str()) {
        return Some(desc.description.to_string());
    }

    // Try partial match for common process patterns
    for (key, desc) in descriptions.iter() {
        if name_lower.contains(key) || key.contains(&name_lower) {
            return Some(desc.description.to_string());
        }
    }

    None
}

/// Get the friendly display name for a process
pub fn get_friendly_name(name: &str) -> String {
    let name_lower = name.to_lowercase();
    let descriptions = get_descriptions();

    // Try exact match first
    if let Some(desc) = descriptions.get(name_lower.as_str()) {
        return desc.friendly_name.to_string();
    }

    // Try partial match for common process patterns
    for (key, desc) in descriptions.iter() {
        if name_lower.contains(key) || key.contains(&name_lower) {
            return desc.friendly_name.to_string();
        }
    }

    // If no match, return the original name (capitalized nicely)
    name.to_string()
}

/// Get full description info for a process
#[allow(dead_code)]
pub fn get_full_description(name: &str) -> Option<&'static ProcessDescription> {
    let name_lower = name.to_lowercase();
    let descriptions = get_descriptions();

    descriptions.get(name_lower.as_str())
}
