use serde::{Deserialize, Serialize};

/// Server connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub domain: Option<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: 22,
            username: String::new(),
            domain: None,
        }
    }
}

/// SSH credentials stored locally
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SSHCredentials {
    pub password: String,   // Stored password
    pub saved_at: String,   // ISO timestamp
}

/// Status of an SSH command execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandStatus {
    Running,
    Completed,
    Failed,
}

/// Result of an SSH command execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub command: String,
    pub status: CommandStatus,
    pub exit_code: Option<i32>,
    pub output: String,
    pub error: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

/// Quick action definition for the UI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickAction {
    pub id: String,
    pub label: String,
    pub command: String,
    pub category: String,       // "login", "status", "service", "logs"
    pub icon: String,           // Icon name for UI
    pub description: String,
}

/// Quick actions configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickActionsConfig {
    pub quick_actions: Vec<QuickAction>,
}

impl Default for QuickActionsConfig {
    fn default() -> Self {
        Self {
            quick_actions: vec![
                QuickAction {
                    id: "login".to_string(),
                    label: "Login".to_string(),
                    command: "echo 'Connected to server'".to_string(),
                    category: "login".to_string(),
                    icon: "Terminal".to_string(),
                    description: "Open SSH session".to_string(),
                },
                QuickAction {
                    id: "uptime".to_string(),
                    label: "Uptime".to_string(),
                    command: "uptime".to_string(),
                    category: "status".to_string(),
                    icon: "Clock".to_string(),
                    description: "Show server uptime".to_string(),
                },
                QuickAction {
                    id: "disk_usage".to_string(),
                    label: "Disk Usage".to_string(),
                    command: "df -h".to_string(),
                    category: "status".to_string(),
                    icon: "HardDrive".to_string(),
                    description: "Show disk usage".to_string(),
                },
                QuickAction {
                    id: "memory".to_string(),
                    label: "Memory".to_string(),
                    command: "free -h".to_string(),
                    category: "status".to_string(),
                    icon: "Cpu".to_string(),
                    description: "Show memory usage".to_string(),
                },
                QuickAction {
                    id: "top_processes".to_string(),
                    label: "Top Processes".to_string(),
                    command: "ps aux --sort=-%mem | head -10".to_string(),
                    category: "status".to_string(),
                    icon: "Activity".to_string(),
                    description: "Show top processes by memory".to_string(),
                },
                QuickAction {
                    id: "nginx_status".to_string(),
                    label: "Nginx Status".to_string(),
                    command: "systemctl status nginx".to_string(),
                    category: "service".to_string(),
                    icon: "Server".to_string(),
                    description: "Check Nginx service status".to_string(),
                },
                QuickAction {
                    id: "nginx_restart".to_string(),
                    label: "Restart Nginx".to_string(),
                    command: "sudo systemctl restart nginx".to_string(),
                    category: "service".to_string(),
                    icon: "RotateCcw".to_string(),
                    description: "Restart Nginx service".to_string(),
                },
                QuickAction {
                    id: "docker_ps".to_string(),
                    label: "Docker Containers".to_string(),
                    command: "docker ps -a".to_string(),
                    category: "service".to_string(),
                    icon: "Box".to_string(),
                    description: "List Docker containers".to_string(),
                },
                QuickAction {
                    id: "nginx_logs".to_string(),
                    label: "Nginx Logs".to_string(),
                    command: "tail -50 /var/log/nginx/access.log".to_string(),
                    category: "logs".to_string(),
                    icon: "FileText".to_string(),
                    description: "Show last 50 Nginx access log lines".to_string(),
                },
                QuickAction {
                    id: "nginx_error_logs".to_string(),
                    label: "Nginx Errors".to_string(),
                    command: "tail -50 /var/log/nginx/error.log".to_string(),
                    category: "logs".to_string(),
                    icon: "AlertTriangle".to_string(),
                    description: "Show last 50 Nginx error log lines".to_string(),
                },
                QuickAction {
                    id: "system_logs".to_string(),
                    label: "System Logs".to_string(),
                    command: "journalctl -n 50 --no-pager".to_string(),
                    category: "logs".to_string(),
                    icon: "ScrollText".to_string(),
                    description: "Show last 50 system journal entries".to_string(),
                },
            ],
        }
    }
}

/// System status information parsed from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStatus {
    pub uptime: String,
    pub load_average: String,
    pub memory_used: String,
    pub memory_total: String,
    pub disk_used: String,
    pub disk_total: String,
    pub cpu_usage: String,
}

/// Event payload for SSH output streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SSHOutputEvent {
    pub session_id: String,
    pub output: String,
    pub is_stderr: bool,
}

/// Event payload for SSH command completion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SSHCompleteEvent {
    pub session_id: String,
    pub exit_code: i32,
    pub error: Option<String>,
}
