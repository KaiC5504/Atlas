import json
import re
import os
from pathlib import Path
from typing import Callable, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

import yt_dlp

from .chinese_utils import (
    is_chinese, to_simplified, to_pinyin, normalize_query,
    generate_search_terms, extract_artist_from_title
)

AUDIO_FORMAT = "opus"
AUDIO_QUALITY = "128"
SAMPLE_RATE = "48000"
CHANNELS = "2"
DEFAULT_PARALLEL = 5


def sanitize_filename(name: str) -> str:
    if not name:
        return "playlist"

    name = name.replace(':', ' -')
    name = re.sub(r'[\\/*?"<>|]', '', name)
    name = re.sub(r'\s+', ' ', name)
    name = name.strip(' .')

    return name if name else "playlist"


class DownloadManager:
    def __init__(
        self,
        output_dir: Path,
        ffmpeg_path: Optional[str] = None,
        log_callback: Optional[Callable[[str], None]] = None,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
    ):
        self.output_dir = Path(output_dir)
        self.tracks_dir = self.output_dir / 'tracks'
        self.playlists_dir = self.output_dir / 'playlists'
        self.index_path = self.output_dir / 'index.json'
        self.ffmpeg_path = ffmpeg_path

        self._log = log_callback or (lambda msg: None)
        self._progress = progress_callback or (lambda cur, total, msg: None)

        self._cancelled = False
        self._print_lock = Lock()

        self.tracks_dir.mkdir(parents=True, exist_ok=True)
        self.playlists_dir.mkdir(parents=True, exist_ok=True)

    def cancel(self):
        """Request cancellation."""
        self._cancelled = True

    def _safe_log(self, msg: str):
        with self._print_lock:
            self._log(msg)

    def _is_single_video_url(self, url: str) -> bool:
        """Check if URL is a single video."""
        if 'watch?v=' in url and 'list=' not in url:
            return True
        if 'youtu.be/' in url and 'list=' not in url:
            return True
        return False

    def fetch_metadata(self, url: str) -> list:
        """Fetch video metadata from URL."""
        is_single = self._is_single_video_url(url)
        self._log("Fetching video info..." if is_single else "Fetching playlist info...")

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'ignoreerrors': True,
            'no_color': True,
        }

        if self.ffmpeg_path:
            ydl_opts['ffmpeg_location'] = self.ffmpeg_path

        if not is_single:
            ydl_opts['extract_flat'] = 'in_playlist'

        videos = []

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                result = ydl.extract_info(url, download=False)

                if result is None:
                    self._log("Error: Could not fetch video info")
                    return []

                if 'entries' in result and result['entries']:
                    entries = list(result['entries'])
                    total = len(entries)
                    self._log(f"Found {total} videos in playlist")

                    for i, entry in enumerate(entries, 1):
                        if self._cancelled:
                            return videos

                        if entry is None:
                            continue

                        video_id = entry.get('id') or entry.get('url', '').split('?')[0].split('/')[-1]
                        if not video_id or len(video_id) != 11:
                            continue

                        title = entry.get('title')
                        if not title or title in ['[Private video]', '[Deleted video]']:
                            continue

                        duration = entry.get('duration', 0)
                        thumbnail = entry.get('thumbnail', '')
                        uploader = entry.get('uploader', entry.get('channel', 'Unknown'))

                        artist, clean_title = extract_artist_from_title(title, uploader or 'Unknown')

                        videos.append({
                            'id': video_id,
                            'title': clean_title,
                            'artist': artist,
                            'original_title': title,
                            'duration': duration or 0,
                            'thumbnail': thumbnail or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                        })

                        if i % 10 == 0:
                            self._progress(i, total, f"Scanning videos: {i}/{total}")

                else:
                    video_id = result.get('id')
                    if video_id:
                        title = result.get('title', 'Unknown')
                        uploader = result.get('uploader', result.get('channel', 'Unknown'))
                        artist, clean_title = extract_artist_from_title(title, uploader)
                        thumbnail = result.get('thumbnail', f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")

                        videos.append({
                            'id': video_id,
                            'title': clean_title,
                            'artist': artist,
                            'original_title': title,
                            'duration': result.get('duration', 0),
                            'thumbnail': thumbnail,
                        })
                        self._log(f"Found: {title}")

            except Exception as e:
                self._log(f"Error: {e}")

        return videos

    def _download_single(self, video: dict, index: int, total: int) -> dict:
        """Download a single video."""
        video_id = video['id']
        title = video['title']
        output_path = self.tracks_dir / f"{video_id}.opus"

        result = {'id': video_id, 'title': title, 'status': 'failed', 'cached': False}

        # Skip if exists
        if output_path.exists() and output_path.stat().st_size > 0:
            self._safe_log(f"[{index}/{total}] Cached: {title[:45]}")
            result['status'] = 'success'
            result['cached'] = True
            return result

        if self._cancelled:
            result['status'] = 'cancelled'
            return result

        url = f"https://www.youtube.com/watch?v={video_id}"

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': str(self.tracks_dir / f"{video_id}.%(ext)s"),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': AUDIO_FORMAT,
                'preferredquality': AUDIO_QUALITY,
            }],
            'postprocessor_args': ['-ar', SAMPLE_RATE, '-ac', CHANNELS],
            'quiet': True,
            'no_warnings': True,
            'ignoreerrors': False,
            'no_color': True,
            'noprogress': True,
            'socket_timeout': 30,
            'retries': 3,
        }

        if self.ffmpeg_path:
            ydl_opts['ffmpeg_location'] = self.ffmpeg_path

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            if output_path.exists() and output_path.stat().st_size > 0:
                self._safe_log(f"[{index}/{total}] Downloaded: {title[:45]}")
                result['status'] = 'success'
            else:
                self._safe_log(f"[{index}/{total}] Failed (empty): {title[:45]}")

        except Exception as e:
            self._safe_log(f"[{index}/{total}] Error: {title[:45]}")

        return result

    def download_videos(self, videos: list, parallel: int = DEFAULT_PARALLEL) -> dict:
        """Download multiple videos in parallel."""
        self._cancelled = False
        total = len(videos)
        successful = 0
        cached = 0
        failed = 0
        new_track_ids = []

        self._log(f"Downloading {total} videos ({parallel} parallel)...")

        with ThreadPoolExecutor(max_workers=parallel) as executor:
            futures = {
                executor.submit(self._download_single, video, i + 1, total): video
                for i, video in enumerate(videos)
            }

            completed = 0
            for future in as_completed(futures):
                if self._cancelled:
                    executor.shutdown(wait=False, cancel_futures=True)
                    break

                try:
                    result = future.result()
                    if result['status'] == 'success':
                        if result['cached']:
                            cached += 1
                        else:
                            successful += 1
                            new_track_ids.append(result['id'])
                    else:
                        failed += 1
                except Exception:
                    failed += 1

                completed += 1
                self._progress(completed, total, f"Downloading: {completed}/{total}")

        return {
            'successful': successful,
            'cached': cached,
            'failed': failed,
            'total': total,
            'new_track_ids': new_track_ids,
        }

    def build_index(self, videos: list) -> dict:
        """Build index from video metadata."""
        index = {}

        for video in videos:
            video_id = video['id']
            opus_path = self.tracks_dir / f"{video_id}.opus"

            if not opus_path.exists():
                continue

            title = to_simplified(video['title'])
            artist = to_simplified(video['artist'])

            title_pinyin = to_pinyin(title) if is_chinese(title) else ""
            artist_pinyin = to_pinyin(artist) if is_chinese(artist) else ""

            search_terms = generate_search_terms(title, artist)

            original_title = video['title']
            if original_title != title:
                search_terms.append(normalize_query(original_title))
                if is_chinese(original_title):
                    search_terms.append(normalize_query(to_pinyin(original_title)))

            search_terms = sorted([t for t in set(search_terms) if t])

            index[video_id] = {
                'title': title,
                'artist': artist,
                'titlePinyin': title_pinyin,
                'artistPinyin': artist_pinyin,
                'searchTerms': search_terms,
                'duration': int(video['duration'] or 0),  # Ensure integer for Rust u32
                'thumbnail': video['thumbnail'],
            }

        return index

    def save_index(self, new_index: dict) -> int:
        """Merge and save index. Returns total count."""
        existing = {}
        if self.index_path.exists():
            try:
                with open(self.index_path, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
            except Exception:
                pass

        merged = {**existing, **new_index}

        with open(self.index_path, 'w', encoding='utf-8') as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)

        return len(merged)

    def save_playlist(self, name: str, videos: list) -> int:
        """Save playlist JSON file."""
        track_ids = [
            v['id'] for v in videos
            if (self.tracks_dir / f"{v['id']}.opus").exists()
        ]

        safe_name = sanitize_filename(name)

        playlist_data = {'name': name, 'tracks': track_ids}
        playlist_path = self.playlists_dir / f"{safe_name}.json"

        with open(playlist_path, 'w', encoding='utf-8') as f:
            json.dump(playlist_data, f, ensure_ascii=False, indent=2)

        self._log(f"Playlist saved: {safe_name}.json")
        return len(track_ids)

    def run(self, url: str, playlist_name: Optional[str] = None, parallel: int = DEFAULT_PARALLEL) -> dict:
        """Run complete download workflow."""
        self._cancelled = False
        is_single = self._is_single_video_url(url)

        videos = self.fetch_metadata(url)
        if not videos:
            return {'success': False, 'error': 'No videos found'}

        if self._cancelled:
            return {'success': False, 'error': 'Cancelled'}

        if is_single and playlist_name and len(videos) == 1:
            videos[0]['original_title'] = videos[0]['title']
            videos[0]['title'] = playlist_name
            playlist_name = None

        download_result = self.download_videos(videos, parallel)

        if self._cancelled:
            return {'success': False, 'error': 'Cancelled'}

        new_index = self.build_index(videos)
        total_entries = self.save_index(new_index)

        playlist_tracks = 0
        if playlist_name:
            playlist_tracks = self.save_playlist(playlist_name, videos)

        return {
            'success': True,
            'downloaded': download_result['successful'],
            'cached': download_result['cached'],
            'failed': download_result['failed'],
            'total': download_result['total'],
            'indexEntries': total_entries,
            'playlistTracks': playlist_tracks,
            'newTrackIds': download_result.get('new_track_ids', []),
            'playlistName': playlist_name,
        }
