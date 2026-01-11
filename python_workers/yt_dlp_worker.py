#!/usr/bin/env python3
"""
YouTube video download worker using yt-dlp.
Receives job parameters from Rust via stdin, downloads the video,
and reports progress/result back via stdout.
"""
import os
import sys
from typing import Any, Dict

# Add common module to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import WorkerBase, run_worker, write_progress, write_log

# Import yt-dlp (will fail gracefully if not installed)
try:
    import yt_dlp
    HAS_YTDLP = True
except ImportError:
    HAS_YTDLP = False


class YTDLPWorker(WorkerBase):
    """
    Worker for downloading YouTube videos using yt-dlp.

    Expected input:
    {
        "url": "https://youtube.com/watch?v=...",
        "quality": "best" | "1080p" | "720p" | "audio_only",
        "output_dir": "/path/to/downloads",
        "job_id": "uuid"
    }

    Output:
    {
        "file_path": "/path/to/downloaded/file.mp4",
        "title": "Video Title",
        "duration": 180,
        "filesize": 1234567
    }
    """

    def validate_input(self, input_data: Dict[str, Any]) -> None:
        if not HAS_YTDLP:
            raise ValueError("yt-dlp is not installed. Run: pip install yt-dlp")

        if "url" not in input_data:
            raise ValueError("Missing required field: url")
        if "output_dir" not in input_data:
            raise ValueError("Missing required field: output_dir")

    def _get_format_string(self, quality: str) -> str:
        """Convert quality setting to yt-dlp format string.
        Prefer H.264 video and AAC audio for maximum compatibility."""
        quality_map = {
            "best": "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best",
            "1080p": "bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            "720p": "bestvideo[height<=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=720]+bestaudio/best[height<=720]",
            "480p": "bestvideo[height<=480][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=480]+bestaudio/best[height<=480]",
            "audio_only": "bestaudio[acodec^=mp4a]/bestaudio/best",
        }
        return quality_map.get(quality, quality_map["best"])

    def _progress_hook(self, d: Dict[str, Any]) -> None:
        """Callback for yt-dlp progress updates."""
        if d["status"] == "downloading":
            # Calculate percent from bytes
            downloaded = d.get("downloaded_bytes", 0)
            total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)

            if total > 0:
                percent = int((downloaded / total) * 100)
                speed = d.get("speed", 0)
                eta = d.get("eta", 0)

                speed_str = ""
                if speed:
                    if speed > 1024 * 1024:
                        speed_str = f"{speed / (1024 * 1024):.1f} MB/s"
                    else:
                        speed_str = f"{speed / 1024:.1f} KB/s"

                eta_str = ""
                if eta:
                    eta_str = f"ETA: {eta}s"

                write_progress(percent, f"Downloading... {speed_str} {eta_str}".strip())

        elif d["status"] == "finished":
            write_progress(90, "Download finished, merging streams...")

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        url = input_data["url"]
        quality = input_data.get("quality", "best")
        output_dir = input_data["output_dir"]

        write_log(f"Starting download: {url}")
        write_progress(0, "Initializing download...")

        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)

        # Configure yt-dlp options
        output_template = os.path.join(output_dir, "%(title)s.%(ext)s")

        ydl_opts = {
            "format": self._get_format_string(quality),
            "outtmpl": output_template,
            "progress_hooks": [self._progress_hook],
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,  # Disable progress bar output to console
            "noplaylist": True,  # Download single video, not playlist
            "merge_output_format": "mp4",  # Merge separate video+audio into mp4
            "prefer_ffmpeg": True,  # Use ffmpeg for merging
            "keepvideo": False,  # Don't keep separate video file after merging
        }

        # Download the video
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            write_progress(1, "Fetching video information...")

            # Get video info first
            info = ydl.extract_info(url, download=False)
            title = info.get("title", "Unknown")
            duration = info.get("duration", 0)

            write_log(f"Video title: {title}")
            write_progress(1, f"Starting download: {title}")

            # Download the video
            ydl.download([url])

            write_progress(95, "Finalizing...")

            # Determine the output file path after merge
            # For merged files, yt-dlp changes the extension to the merge format
            filename = ydl.prepare_filename(info)

            # Check if file was merged (extension might have changed)
            if not os.path.exists(filename):
                # Try with .mp4 extension (merge output format)
                base_name = os.path.splitext(filename)[0]
                filename = base_name + ".mp4"
                write_log(f"Using merged filename: {filename}")

            if not os.path.exists(filename):
                raise FileNotFoundError(f"Downloaded file not found: {filename}")

            # Get file size
            filesize = os.path.getsize(filename)
            write_log(f"Download complete. File: {filename}, Size: {filesize} bytes")

        write_progress(100, "Download complete!")

        return {
            "file_path": filename,
            "title": title,
            "duration": duration,
            "filesize": filesize,
        }


if __name__ == "__main__":
    run_worker(YTDLPWorker)
