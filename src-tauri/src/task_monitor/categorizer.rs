use super::models::ProcessCategory;

pub fn categorize_process(name: &str, exe_path: Option<&str>) -> ProcessCategory {
    let name_lower = name.to_lowercase();

    if is_anti_cheat(&name_lower, exe_path) {
        return ProcessCategory::AntiCheatProtected;
    }

    if is_system_critical(&name_lower) {
        return ProcessCategory::SystemCritical;
    }

    if is_security_software(&name_lower, exe_path) {
        return ProcessCategory::SecuritySoftware;
    }

    if is_driver_hardware(&name_lower, exe_path) {
        return ProcessCategory::DriverHardware;
    }

    if is_microsoft_bloat(&name_lower, exe_path) {
        return ProcessCategory::MicrosoftBloat;
    }

    if is_system_service(&name_lower) {
        return ProcessCategory::SystemService;
    }

    if is_background_service(&name_lower) {
        return ProcessCategory::BackgroundService;
    }

    if is_user_application(&name_lower, exe_path) {
        return ProcessCategory::UserApplication;
    }

    ProcessCategory::Unknown
}
e
fn is_anti_cheat(name: &str, path: Option<&str>) -> bool {
    let anti_cheat_names = [
        // Riot Vanguard
        "vgc",
        "vgk",
        "vgtray",
        // Riot Games
        "valorant",
        "riotclient",
        "riot",
        // Easy Anti-Cheat
        "easyanticheat",
        "eac_",
        // BattlEye
        "beservice",
        "beclient",
        "battleye",
        // Other anti-cheats
        "vac",
        "punkbuster",
        "fairfight",
        "xigncode",
        "gameguard",
        "nprotect",
        "hackshield",
    ];

    if anti_cheat_names.iter().any(|ac| name.contains(ac)) {
        return true;
    }

    if let Some(p) = path {
        let p_lower = p.to_lowercase();
        if p_lower.contains("riot games")
            || p_lower.contains("riot vanguard")
            || p_lower.contains("easyanticheat")
            || p_lower.contains("battleye")
            || p_lower.contains("anti-cheat")
            || p_lower.contains("anticheat")
        {
            return true;
        }
    }

    false
}

/// Check if process is system critical
fn is_system_critical(name: &str) -> bool {
    let critical_processes = [
        "csrss.exe",
        "wininit.exe",
        "lsass.exe",
        "services.exe",
        "smss.exe",
        "dwm.exe",
        "winlogon.exe",
        "system",
        "system idle process",
        "registry",
        "memory compression",
        "svchost.exe",
        "ntoskrnl.exe",
        "explorer.exe",
        "spoolsv.exe",
        "lsm.exe",
        "sihost.exe",
        "fontdrvhost.exe",
        "dashost.exe",
        "ctfmon.exe",
        "conhost.exe",
        "runtimebroker.exe",
        "taskhostw.exe",
        "audiodg.exe",
        "wudfhost.exe",
        // Credential Guard and security isolation
        "lsaiso.exe",
        "secure system",
        "idle",
        "ngciso.exe",
        // Windows shell infrastructure
        "applicationframehost.exe",
        "shellexperiencehost.exe",
        "textinputhost.exe",
        "shellhost.exe",
        "lockapp.exe",
        "chsime.exe",
        "unsecapp.exe",
    ];

    critical_processes.iter().any(|p| name == *p || name.starts_with("csrss"))
}

/// Check security software
fn is_security_software(name: &str, path: Option<&str>) -> bool {
    let security_names = [
        // Windows Defender
        "msmpeng.exe",
        "nissrv.exe",
        "securityhealthservice.exe",
        "securityhealthsystray.exe",
        "msseces.exe",
        "mpdefendercoreservice.exe",
        // Common AV
        "avp.exe",      
        "avgui.exe",    
        "avguard.exe",  
        "bdagent.exe",  
        "mcshield.exe", 
        "nortonsecurity.exe",
    ];

    if security_names.iter().any(|s| name == *s) {
        return true;
    }

    if let Some(p) = path {
        let p_lower = p.to_lowercase();
        if p_lower.contains("windows defender")
            || p_lower.contains("antivirus")
            || p_lower.contains("kaspersky")
            || p_lower.contains("norton")
            || p_lower.contains("mcafee")
            || p_lower.contains("bitdefender")
            || p_lower.contains("avast")
            || p_lower.contains("avg")
            || p_lower.contains("malwarebytes")
        {
            return true;
        }
    }

    false
}

/// Check driver/hardware
fn is_driver_hardware(name: &str, path: Option<&str>) -> bool {
    let driver_names = [
        // NVIDIA
        "nvdisplay.container.exe",
        "nvcontainer.exe",
        "nvspcaps64.exe",
        // AMD
        "amdow.exe",
        "amdrsserv.exe",
        "amddvr.exe",
        // Intel
        "igfxcuiservice.exe",
        "igfxtray.exe",
        "igfxem.exe",
        "intelaudioservice.exe",
        "intel_pie_service.exe",
        "intelcphdcpsvc.exe",
        "oneapp.igcc.winservice.exe",
        "jhi_service.exe",
        "esrv_svc.exe",
        // Audio
        "realtek",
        "rtkauduservice64.exe",
        "dax3api.exe",
        "nahimic",
        // Thunderbolt
        "thunderboltservice.exe",
        // ASUS hardware services
        "asusnumpadservice.exe",
        // Other hardware
        "razer",
        "corsair",
        "logitech",
        "logi_lamparray_service.exe",
        "steelseries",
    ];

    if driver_names.iter().any(|d| name.contains(d)) {
        return true;
    }

    if let Some(p) = path {
        let p_lower = p.to_lowercase();
        if p_lower.contains("nvidia corporation")
            || p_lower.contains("amd")
            || p_lower.contains("intel")
            || p_lower.contains("realtek")
            || p_lower.contains("dolby")
        {
            return true;
        }
    }

    false
}

/// Check process is Microsoft bloatware
fn is_microsoft_bloat(name: &str, path: Option<&str>) -> bool {
    let bloat_names = [
        // Edge browser
        "msedge.exe",
        // Windows bloat
        "searchindexer.exe",
        "searchprotocolhost.exe",
        "searchfilterhost.exe",
        "searchhost.exe",
        "cortana.exe",
        "searchapp.exe",
        "startmenuexperiencehost.exe",
        "yourphone.exe",
        "phoneexperiencehost.exe",
        "gamebar",
        "gamebarft",
        "gamebarpresencewriter",
        "gameinputsvc.exe",
        // Xbox Gaming Services
        "gamingservices.exe",
        "gamingservicesnet.exe",
        "gameinputredistservice.exe",
        "gamesdk.exe",
        // OneDrive
        "onedrive.exe",
        "onedrivesetup.exe",
        // Teams
        "msteams.exe",
        // Xbox
        "xboxpcapp.exe",
        // Windows widgets
        "widgets.exe",
        "widgetservice.exe",
        // Feedback
        "feedback",
        // News
        "msn",
        // Tips
        "tips",
        // Skype
        "skype",
        // Office services
        "officeclicktorun.exe",
        // Cross-device features
        "crossdeviceresume.exe",
        // Aggregator/telemetry
        "aggregatorhost.exe",
    ];

    if bloat_names.iter().any(|b| name.contains(b)) {
        return true;
    }

    if let Some(p) = path {
        let p_lower = p.to_lowercase();
        if p_lower.contains("windowsapps") && !p_lower.contains("xbox")
            || p_lower.contains("microsoft edge")
        {
            return true;
        }
    }

    false
}

/// Check process is a system service
fn is_system_service(name: &str) -> bool {
    let service_names = [
        "wlanext.exe",
        "wlanapi.dll",
        "networkservice",
        "localservice",
        "wuauserv",
        "bits",
        "cryptsvc",
        "dnscache",
        "iphlpsvc",
        "netprofm",
        "nlasvc",
        "nsi",
        "w32time",
        "winmgmt",
        "msedgewebview2.exe",
    ];

    service_names.iter().any(|s| name.contains(s))
}

/// Check process is background service
fn is_background_service(name: &str) -> bool {
    let background_names = [
        "backgroundtaskhost.exe",
        "backgroundtransfersvc",
        "apphelp",
        "compattelrunner.exe",
        "diagtrack",
        "dllhost.exe",
        "wmiapsrv.exe",
        "wmiprvse.exe",
        "smartscreen.exe",
        "crashreporter",
        "updater",
        "update.exe",
        // ASUS services
        "glidexservice.exe",
        "glidexserviceext.exe",
        "glidexremoteservice.exe",
        "glidexnearservice.exe",
        "rogliveservice.exe",
        "armourycrate.service.exe",
        "lightingservice.exe",
        "aborcontrolservice.exe",
        "asusoptimization.exe",
        "asuslinksvc.exe",
        // Third-party services
        "mdnsresponder.exe",
        "applemobiledeviceservice.exe",
        "teamviewer_service.exe",
        "collector_service.exe",
        "telemetry_agent.exe",
        // Frame monitoring
        "presentmonservice.exe",
    ];

    background_names.iter().any(|b| name.contains(b))
}

/// Check process is user application
fn is_user_application(name: &str, path: Option<&str>) -> bool {
    let user_app_names = [
        // Browsers
        "chrome.exe",
        "firefox.exe",
        "brave.exe",
        "opera.exe",
        // Communication
        "discord.exe",
        "spotify.exe",
        "slack.exe",
        "telegram.exe",
        "whatsapp.exe",
        "zoom.exe",
        // Gaming platforms
        "steam.exe",
        "steamwebhelper.exe",
        "epicgameslauncher.exe",
        // Development tools
        "code.exe", 
        "notepad.exe",
        "notepad++.exe",
        "atlas.exe",
        "python.exe",
        "pythonw.exe",
        "claude.exe",
        "cargo.exe",
        "esbuild.exe",
        "uv.exe",
        "node.exe",
        "git.exe",
        "aria2c.exe",
        // Terminals
        "cmd.exe",
        "powershell.exe",
        "pwsh.exe",
        // ASUS utilities
        "ghelper.exe",
        // Media
        "vlc.exe",
        "obs64.exe",
        "obs32.exe",
        // Windows apps
        "systemsettings.exe",
    ];

    if user_app_names.iter().any(|u| name.contains(u)) {
        return true;
    }

    if let Some(p) = path {
        let p_lower = p.to_lowercase();
        if p_lower.contains("program files") || p_lower.contains("programdata") {
            return true;
        }
    }

    false
}

/// Determine if a process can be safely killed based on its category
pub fn can_kill_process(category: &ProcessCategory) -> bool {
    match category {
        ProcessCategory::AntiCheatProtected => false,
        ProcessCategory::SystemCritical => false,
        ProcessCategory::SystemService => false,
        ProcessCategory::SecuritySoftware => false,
        ProcessCategory::DriverHardware => false,
        ProcessCategory::MicrosoftBloat => true,
        ProcessCategory::UserApplication => true,
        ProcessCategory::BackgroundService => true,
        ProcessCategory::Unknown => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anti_cheat_detection() {
        assert!(is_anti_cheat("vgc.exe", None));
        assert!(is_anti_cheat("vgtray.exe", None));
        assert!(is_anti_cheat("valorant-win64-shipping.exe", None));
        assert!(is_anti_cheat("riotclientservices.exe", None));
        assert!(is_anti_cheat("easyanticheat_eos.exe", None));
        assert!(is_anti_cheat("beservice_x64.exe", None));
        assert!(is_anti_cheat(
            "unknown.exe",
            Some("C:\\Riot Games\\Riot Vanguard\\vgc.exe")
        ));
    }

    #[test]
    fn test_system_critical_detection() {
        assert!(is_system_critical("csrss.exe"));
        assert!(is_system_critical("lsass.exe"));
        assert!(is_system_critical("svchost.exe"));
        assert!(is_system_critical("explorer.exe"));
        assert!(is_system_critical("dwm.exe"));
    }

    #[test]
    fn test_bloat_detection() {
        assert!(is_microsoft_bloat("msedge.exe", None));
        assert!(is_microsoft_bloat("searchindexer.exe", None));
        assert!(is_microsoft_bloat("cortana.exe", None));
        assert!(is_microsoft_bloat("onedrive.exe", None));
    }

    #[test]
    fn test_can_kill_categories() {
        assert!(!can_kill_process(&ProcessCategory::AntiCheatProtected));
        assert!(!can_kill_process(&ProcessCategory::SystemCritical));
        assert!(can_kill_process(&ProcessCategory::MicrosoftBloat));
        assert!(can_kill_process(&ProcessCategory::UserApplication));
    }
}
