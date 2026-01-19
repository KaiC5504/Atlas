use crate::file_manager::{read_json_file, write_json_file};
use crate::utils::get_gaming_profiles_json_path;
use super::models::{GamingProfile, GamingProfileList};
use uuid::Uuid;

pub fn get_profiles() -> Result<Vec<GamingProfile>, String> {
    let path = get_gaming_profiles_json_path();

    if !path.exists() {
        return Ok(get_default_profiles());
    }

    let list: GamingProfileList = read_json_file(&path)?;
    Ok(list.profiles)
}

pub fn save_profile(profile: GamingProfile) -> Result<(), String> {
    let path = get_gaming_profiles_json_path();
    let mut list: GamingProfileList = if path.exists() {
        read_json_file(&path)?
    } else {
        GamingProfileList::default()
    };

    if let Some(idx) = list.profiles.iter().position(|p| p.id == profile.id) {
        list.profiles[idx] = profile;
    } else {
        list.profiles.push(profile);
    }

    write_json_file(&path, &list)
}

pub fn delete_profile(id: &str) -> Result<(), String> {
    let path = get_gaming_profiles_json_path();

    if !path.exists() {
        return Err("Profile not found".to_string());
    }

    let mut list: GamingProfileList = read_json_file(&path)?;
    let initial_len = list.profiles.len();
    list.profiles.retain(|p| p.id != id);

    if list.profiles.len() == initial_len {
        return Err("Profile not found".to_string());
    }

    write_json_file(&path, &list)
}

pub fn set_default_profile(id: &str) -> Result<(), String> {
    let path = get_gaming_profiles_json_path();

    if !path.exists() {
        return Err("No profiles exist".to_string());
    }

    let mut list: GamingProfileList = read_json_file(&path)?;
    let mut found = false;

    for profile in &mut list.profiles {
        if profile.id == id {
            profile.is_default = true;
            found = true;
        } else {
            profile.is_default = false;
        }
    }

    if !found {
        return Err("Profile not found".to_string());
    }

    write_json_file(&path, &list)
}

#[allow(dead_code)]
pub fn get_default_profile() -> Result<Option<GamingProfile>, String> {
    let profiles = get_profiles()?;
    Ok(profiles.into_iter().find(|p| p.is_default))
}

fn get_default_profiles() -> Vec<GamingProfile> {
    vec![
        GamingProfile {
            id: Uuid::new_v4().to_string(),
            name: "Prepare for Gaming".to_string(),
            processes_to_kill: vec![
                "msedge.exe".to_string(),
                "searchindexer.exe".to_string(),
                "searchapp.exe".to_string(),
                "cortana.exe".to_string(),
                "widgets.exe".to_string(),
                "widgetservice.exe".to_string(),
                "onedrive.exe".to_string(),
                "yourphone.exe".to_string(),
                "msteams.exe".to_string(),
                "compattelrunner.exe".to_string(),
            ],
            is_default: true,
        },
        GamingProfile {
            id: Uuid::new_v4().to_string(),
            name: "Light Cleanup".to_string(),
            processes_to_kill: vec![
                "searchindexer.exe".to_string(),
                "widgets.exe".to_string(),
                "compattelrunner.exe".to_string(),
            ],
            is_default: false,
        },
        GamingProfile {
            id: Uuid::new_v4().to_string(),
            name: "Heavy Cleanup".to_string(),
            processes_to_kill: vec![
                "msedge.exe".to_string(),
                "chrome.exe".to_string(),
                "firefox.exe".to_string(),
                "searchindexer.exe".to_string(),
                "searchapp.exe".to_string(),
                "cortana.exe".to_string(),
                "widgets.exe".to_string(),
                "widgetservice.exe".to_string(),
                "onedrive.exe".to_string(),
                "yourphone.exe".to_string(),
                "msteams.exe".to_string(),
                "slack.exe".to_string(),
                "spotify.exe".to_string(),
                "compattelrunner.exe".to_string(),
                "gamebar.exe".to_string(),
            ],
            is_default: false,
        },
    ]
}

pub fn initialize_profiles() -> Result<(), String> {
    let path = get_gaming_profiles_json_path();

    if !path.exists() {
        let list = GamingProfileList {
            profiles: get_default_profiles(),
        };
        write_json_file(&path, &list)?;
    }

    Ok(())
}
