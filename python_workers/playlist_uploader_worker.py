import json
import sys
from pathlib import Path
from typing import Any, Dict

from common.worker_base import WorkerBase, run_worker
from common.json_io import write_log, write_progress


class PlaylistUploaderWorker(WorkerBase):

    def validate_input(self, input_data: Dict[str, Any]) -> None:
        if "action" not in input_data:
            raise ValueError("Missing required field: action")

        if "music_dir" not in input_data:
            raise ValueError("Missing required field: music_dir")

        action = input_data["action"]

        if action == "sync_from_server":
            required = ["host", "port", "username", "password"]
            for field in required:
                if field not in input_data:
                    raise ValueError(f"Missing required field: {field}")

        elif action == "download_playlist":
            if "url" not in input_data:
                raise ValueError("Missing required field: url")

        elif action == "upload_to_server":
            required = ["host", "port", "username", "password", "track_ids"]
            for field in required:
                if field not in input_data:
                    raise ValueError(f"Missing required field: {field}")

    def _log(self, msg: str):
        write_log(msg)

    def _progress(self, current: int, total: int, message: str):
        if total > 0:
            percent = int((current / total) * 100)
            write_progress(percent, message)

    def sync_from_server(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Sync index.json, playlist.js, and playlists from server."""
        from playlist_uploader.vps_sync import VPSSyncManager

        music_dir = Path(input_data["music_dir"])
        playlist_js_path = music_dir / "playlist.js"

        sync_manager = VPSSyncManager(
            local_music_dir=music_dir,
            local_playlist_js=playlist_js_path,
            log_callback=self._log,
            progress_callback=self._progress
        )

        success, error = sync_manager.connect(
            host=input_data["host"],
            port=input_data["port"],
            username=input_data["username"],
            password=input_data["password"]
        )

        if not success:
            return {"success": False, "error": error}

        try:
            self._progress(1, 4, "Pulling index.json...")
            merged_index = sync_manager.pull_index()

            self._progress(2, 4, "Pulling playlist.js...")
            sync_manager.pull_playlist_js()

            self._progress(3, 4, "Pulling playlists...")
            playlist_names = sync_manager.pull_playlists()

            self._progress(4, 4, "Sync complete")

            return {
                "success": True,
                "indexEntries": len(merged_index),
                "playlistsCount": len(playlist_names),
                "playlistNames": playlist_names
            }

        finally:
            sync_manager.disconnect()

    def download_playlist(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Download YouTube content."""
        from playlist_uploader.downloader import DownloadManager

        music_dir = Path(input_data["music_dir"])
        url = input_data["url"]
        playlist_name_raw = input_data.get("playlist_name")
        parallel = input_data.get("parallel", 5)

        if playlist_name_raw and playlist_name_raw != "None":
            playlist_name = playlist_name_raw.strip() if isinstance(playlist_name_raw, str) else None
            if not playlist_name:
                playlist_name = None
        else:
            playlist_name = None

        download_manager = DownloadManager(
            output_dir=music_dir,
            log_callback=self._log,
            progress_callback=self._progress
        )

        result = download_manager.run(
            url=url,
            playlist_name=playlist_name,
            parallel=parallel
        )

        return result

    def upload_to_server(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Upload tracks to server and restart bot."""
        from playlist_uploader.vps_sync import VPSSyncManager, update_local_playlist_js

        music_dir = Path(input_data["music_dir"])
        playlist_js_path = music_dir / "playlist.js"
        playlists_dir = music_dir / "playlists"
        track_ids = input_data["track_ids"]
        playlist_name = input_data.get("playlist_name")


        sync_manager = VPSSyncManager(
            local_music_dir=music_dir,
            local_playlist_js=playlist_js_path,
            log_callback=self._log,
            progress_callback=self._progress
        )

        success, error = sync_manager.connect(
            host=input_data["host"],
            port=input_data["port"],
            username=input_data["username"],
            password=input_data["password"]
        )

        if not success:
            return {"success": False, "error": error}

        try:
            index_data = {}
            index_path = music_dir / "index.json"
            if index_path.exists():
                with open(index_path, 'r', encoding='utf-8') as f:
                    index_data = json.load(f)

            self._progress(1, 7, "Uploading tracks...")
            uploaded, skipped = sync_manager.push_tracks(track_ids, index_data)

            playlist_uploaded = False
            if playlist_name and track_ids:
                self._progress(2, 7, "Creating playlist...")
                safe_name = playlist_name.replace(':', ' -')
                for char in '\\/*?"<>|':
                    safe_name = safe_name.replace(char, '')
                safe_name = safe_name.strip()

                playlists_dir.mkdir(parents=True, exist_ok=True)
                playlist_path = playlists_dir / f"{safe_name}.json"
                playlist_data = {'name': playlist_name, 'tracks': track_ids}
                with open(playlist_path, 'w', encoding='utf-8') as f:
                    json.dump(playlist_data, f, ensure_ascii=False, indent=2)
                playlist_uploaded = sync_manager.push_playlist(playlist_name)

            self._progress(3, 7, "Updating playlist.js...")
            playlist_js_updated = False
            if playlist_name and playlist_js_path.exists():
                playlist_js_updated = update_local_playlist_js(playlist_js_path, playlist_name)

            self._progress(4, 7, "Uploading index...")
            index_uploaded = sync_manager.push_index()

            self._progress(5, 7, "Uploading playlist.js...")
            playlist_js_uploaded = False
            if playlist_name and playlist_js_path.exists():
                playlist_js_uploaded = sync_manager.push_playlist_js()

            self._progress(6, 7, "Restarting Discord bot...")
            bot_restarted = sync_manager.restart_bot()

            self._progress(7, 7, "Cleaning up local files...")
            tracks_dir = music_dir / "tracks"
            deleted_count = 0
            for track_id in track_ids:
                opus_path = tracks_dir / f"{track_id}.opus"
                if opus_path.exists():
                    try:
                        opus_path.unlink()
                        deleted_count += 1
                    except Exception as e:
                        self._log(f"Failed to delete {track_id}.opus: {e}")

            return {
                "success": True,
                "uploadedTracks": uploaded,
                "skippedTracks": skipped,
                "playlistUploaded": playlist_uploaded,
                "playlistJsUpdated": playlist_js_updated,
                "botRestarted": bot_restarted,
                "deletedTracks": deleted_count
            }

        finally:
            sync_manager.disconnect()

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process the request based on action."""
        action = input_data["action"]

        if action == "sync_from_server":
            return self.sync_from_server(input_data)
        elif action == "download_playlist":
            return self.download_playlist(input_data)
        elif action == "upload_to_server":
            return self.upload_to_server(input_data)
        else:
            raise ValueError(f"Unknown action: {action}")


if __name__ == "__main__":
    run_worker(PlaylistUploaderWorker)
