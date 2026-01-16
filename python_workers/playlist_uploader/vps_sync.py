import json
import re
from pathlib import Path
from typing import Callable, Optional

import paramiko

REMOTE_BASE = "/root/discord-musicbot"
REMOTE_MUSIC_DIR = f"{REMOTE_BASE}/music"
REMOTE_INDEX = f"{REMOTE_MUSIC_DIR}/index.json"
REMOTE_PLAYLISTS_DIR = f"{REMOTE_MUSIC_DIR}/playlists"
REMOTE_TRACKS_DIR = f"{REMOTE_MUSIC_DIR}/tracks"
REMOTE_PLAYLIST_JS = f"{REMOTE_BASE}/commands/playlist.js"

BOT_RESTART_CMD = 'export PATH="/root/.nvm/versions/node/v24.13.0/bin:$PATH" && pm2 restart nino-music'


class VPSSyncManager:
    """SSH/SFTP operations for syncing with Discord music bot server."""

    def __init__(
        self,
        local_music_dir: Path,
        local_playlist_js: Path,
        log_callback: Optional[Callable[[str], None]] = None,
        progress_callback: Optional[Callable[[int, int, str], None]] = None
    ):
        self.local_music_dir = local_music_dir
        self.local_playlist_js = local_playlist_js
        self.local_index_path = local_music_dir / 'index.json'
        self.local_playlists_dir = local_music_dir / 'playlists'
        self.local_tracks_dir = local_music_dir / 'tracks'

        self.local_music_dir.mkdir(parents=True, exist_ok=True)
        self.local_playlists_dir.mkdir(parents=True, exist_ok=True)
        self.local_tracks_dir.mkdir(parents=True, exist_ok=True)

        self._log = log_callback or (lambda msg: None)
        self._progress = progress_callback or (lambda cur, total, msg: None)

        self.client: Optional[paramiko.SSHClient] = None
        self.sftp: Optional[paramiko.SFTPClient] = None

    def connect(self, host: str, port: int, username: str, password: str) -> tuple:
        """Connect to VPS via SSH. Returns (success, error_message)."""
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            self.client.connect(
                hostname=host,
                port=port,
                username=username,
                password=password,
                timeout=10,
                banner_timeout=10
            )

            self.sftp = self.client.open_sftp()
            return True, ""

        except paramiko.AuthenticationException:
            return False, "Authentication failed - check password"
        except paramiko.SSHException as e:
            return False, f"SSH error: {e}"
        except TimeoutError:
            return False, "Connection timed out"
        except Exception as e:
            return False, f"Connection error: {e}"

    def disconnect(self) -> None:
        """Disconnect from VPS."""
        if self.sftp:
            self.sftp.close()
            self.sftp = None
        if self.client:
            self.client.close()
            self.client = None

    def _ensure_remote_dir(self, remote_path: str) -> None:
        """Ensure remote directory exists."""
        try:
            self.sftp.stat(remote_path)
        except FileNotFoundError:
            self.sftp.mkdir(remote_path)

    def pull_index(self) -> dict:
        """Pull index.json from server and merge with local."""
        local_index = {}
        if self.local_index_path.exists():
            try:
                with open(self.local_index_path, 'r', encoding='utf-8') as f:
                    local_index = json.load(f)
            except Exception:
                pass

        remote_index = {}
        try:
            with self.sftp.open(REMOTE_INDEX, 'r') as f:
                content = f.read().decode('utf-8')
                remote_index = json.loads(content)
        except FileNotFoundError:
            pass
        except Exception:
            pass

        merged_index = {**local_index, **remote_index}

        for video_id, entry in merged_index.items():
            if 'duration' in entry and isinstance(entry['duration'], float):
                entry['duration'] = int(entry['duration'])

        with open(self.local_index_path, 'w', encoding='utf-8') as f:
            json.dump(merged_index, f, ensure_ascii=False, indent=2)

        return merged_index

    def pull_playlist_js(self) -> bool:
        """Pull playlist.js from server."""
        try:
            with self.sftp.open(REMOTE_PLAYLIST_JS, 'r') as f:
                content = f.read().decode('utf-8')

            with open(self.local_playlist_js, 'w', encoding='utf-8') as f:
                f.write(content)

            return True

        except FileNotFoundError:
            return False
        except Exception:
            return False

    def pull_playlists(self) -> list:
        """Pull all playlist JSON files from server. Returns list of names."""
        names = []

        try:
            self._ensure_remote_dir(REMOTE_PLAYLISTS_DIR)
            remote_files = self.sftp.listdir(REMOTE_PLAYLISTS_DIR)
            json_files = [f for f in remote_files if f.endswith('.json')]

            for filename in json_files:
                remote_path = f"{REMOTE_PLAYLISTS_DIR}/{filename}"
                local_path = self.local_playlists_dir / filename

                try:
                    with self.sftp.open(remote_path, 'r') as rf:
                        content = rf.read().decode('utf-8')
                    with open(local_path, 'w', encoding='utf-8') as lf:
                        lf.write(content)

                    try:
                        data = json.loads(content)
                        names.append(data.get('name', filename[:-5]))
                    except json.JSONDecodeError:
                        names.append(filename[:-5])
                except Exception:
                    pass
        except Exception:
            pass

        return names

    def push_index(self) -> bool:
        """Push local index.json to server."""
        try:
            with open(self.local_index_path, 'r', encoding='utf-8') as f:
                content = f.read()

            self._ensure_remote_dir(REMOTE_MUSIC_DIR)

            with self.sftp.open(REMOTE_INDEX, 'w') as rf:
                rf.write(content.encode('utf-8'))

            return True

        except Exception:
            return False

    def push_playlist(self, playlist_name: str) -> bool:
        """Push a specific playlist JSON to server."""
        safe_name = playlist_name.replace(':', ' -')
        for char in '\\/*?"<>|':
            safe_name = safe_name.replace(char, '')
        safe_name = safe_name.strip()

        local_path = self.local_playlists_dir / f"{safe_name}.json"

        if not local_path.exists():
            return False

        try:
            with open(local_path, 'r', encoding='utf-8') as f:
                content = f.read()

            self._ensure_remote_dir(REMOTE_PLAYLISTS_DIR)
            remote_path = f"{REMOTE_PLAYLISTS_DIR}/{safe_name}.json"

            with self.sftp.open(remote_path, 'w') as rf:
                rf.write(content.encode('utf-8'))

            return True

        except Exception:
            return False

    def push_tracks(self, track_ids: list, index_data: dict = None) -> tuple:
        """Push track files to server. Returns (uploaded, skipped)."""
        if not track_ids:
            return 0, 0

        uploaded = 0
        skipped = 0
        total = len(track_ids)

        try:
            self._ensure_remote_dir(REMOTE_TRACKS_DIR)

            try:
                remote_files = set(self.sftp.listdir(REMOTE_TRACKS_DIR))
            except Exception:
                remote_files = set()

            for i, track_id in enumerate(track_ids):
                filename = f"{track_id}.opus"
                local_path = self.local_tracks_dir / filename
                remote_path = f"{REMOTE_TRACKS_DIR}/{filename}"

                self._progress(i + 1, total, f"Uploading tracks: {i + 1}/{total}")

                if not local_path.exists():
                    continue

                if filename in remote_files:
                    skipped += 1
                    continue

                try:
                    self.sftp.put(str(local_path), remote_path)
                    uploaded += 1
                except Exception:
                    pass

        except Exception:
            pass

        return uploaded, skipped

    def push_playlist_js(self) -> bool:
        """Push local playlist.js to server."""
        if not self.local_playlist_js.exists():
            return False

        try:
            with open(self.local_playlist_js, 'r', encoding='utf-8') as f:
                content = f.read()

            with self.sftp.open(REMOTE_PLAYLIST_JS, 'w') as rf:
                rf.write(content.encode('utf-8'))

            return True

        except Exception:
            return False

    def restart_bot(self) -> bool:
        """Restart the Discord bot via PM2."""
        try:
            stdin, stdout, stderr = self.client.exec_command(BOT_RESTART_CMD)
            exit_status = stdout.channel.recv_exit_status()
            return exit_status == 0
        except Exception:
            return False

def parse_playlist_choices(js_content: str) -> list:
    """Extract existing playlist names from playlist.js content."""
    pattern = r'\.addChoices\s*\(([\s\S]*?)\)'
    match = re.search(pattern, js_content)
    if not match:
        return []

    choices_block = match.group(1)
    name_pattern = r"\{\s*name:\s*['\"]([^'\"]+)['\"]"
    return re.findall(name_pattern, choices_block)


def add_playlist_choice(js_content: str, playlist_name: str) -> str:
    """Add a new playlist choice to playlist.js content."""
    existing = parse_playlist_choices(js_content)
    if playlist_name in existing:
        return js_content

    quote = '"' if "'" in playlist_name else "'"
    new_entry = f"{{ name: {quote}{playlist_name}{quote}, value: {quote}{playlist_name}{quote} }}"

    pattern = r'(\.addChoices\s*\(\s*\n)([\s\S]*?)(\s*\))'

    def replacer(match):
        start = match.group(1)
        entries = match.group(2).rstrip()
        end = match.group(3)

        indent_match = re.search(r'^(\s+)\{', entries, re.MULTILINE)
        indent = indent_match.group(1) if indent_match else '                    '

        if not entries.rstrip().endswith(','):
            entries = entries.rstrip() + ','

        return f"{start}{entries}\n{indent}{new_entry}\n{end}"

    return re.sub(pattern, replacer, js_content)


def update_local_playlist_js(playlist_js_path: Path, playlist_name: str) -> bool:
    """Update local playlist.js to include a new playlist choice."""
    if not playlist_js_path.exists():
        return False

    try:
        with open(playlist_js_path, 'r', encoding='utf-8') as f:
            content = f.read()

        existing = parse_playlist_choices(content)
        if playlist_name in existing:
            return False

        new_content = add_playlist_choice(content, playlist_name)

        with open(playlist_js_path, 'w', encoding='utf-8') as f:
            f.write(new_content)

        return True

    except Exception:
        return False
