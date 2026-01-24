"""
Gacha History Worker for HoYoverse games.
Extracts auth URL from web cache and fetches gacha records from API.
"""
import os
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, parse_qs, urlencode
import requests

from common.worker_base import WorkerBase, run_worker
from common.json_io import write_log, write_progress


# Game configurations
GAME_CONFIGS = {
    "genshin": {
        "cache_path": "GenshinImpact_Data/webCaches/Cache/Cache_Data/data_2",
        "api_endpoint": "https://public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog",
        "url_pattern": rb"https://[^\x00]+?hk4e[^\x00]+?gacha[^\x00]+?authkey=[^\x00]+",
        "gacha_types": ["301", "302", "200", "100", "500"],
    },
    "starrail": {
        "cache_path": "StarRail_Data/webCaches/Cache/Cache_Data/data_2",
        "api_endpoint": "https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api/getGachaLog",
        "url_pattern": rb"https://[^\x00]+?hkrpg[^\x00]+?gacha[^\x00]+?authkey=[^\x00]+",
        "gacha_types": ["11", "12", "1", "2"],
    },
    "zzz": {
        "cache_path": "ZenlessZoneZero_Data/webCaches/Cache/Cache_Data/data_2",
        "api_endpoint": "https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog",
        "url_pattern": rb"https://[^\x00]+?nap[^\x00]+?gacha[^\x00]+?authkey=[^\x00]+",
        "gacha_types": ["2001", "3001", "1001", "5001"],
    },
}


class GachaHistoryWorker(WorkerBase):
    """Worker for extracting gacha history from HoYoverse games."""

    def validate_input(self, input_data: Dict[str, Any]) -> None:
        if "game" not in input_data:
            raise ValueError("Missing required field: game")
        if "game_path" not in input_data:
            raise ValueError("Missing required field: game_path")

        game = input_data["game"]
        if game not in GAME_CONFIGS:
            raise ValueError(f"Unsupported game: {game}. Must be one of: {list(GAME_CONFIGS.keys())}")

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        game = input_data["game"]
        game_path = input_data["game_path"]
        last_id = input_data.get("last_id")

        config = GAME_CONFIGS[game]

        write_log(f"Processing gacha history for {game}")
        write_progress(5, "Extracting auth URL from cache...")

        # Step 1: Extract auth URL from cache
        auth_url = self.extract_auth_url(game_path, config)
        if not auth_url:
            raise ValueError("Could not find auth URL in game cache. Please open the wish/warp history in-game first.")

        write_log(f"Found auth URL")
        write_progress(15, "Validating auth URL...")

        # Step 2: Parse auth parameters
        auth_params = self.parse_auth_url(auth_url)
        if not auth_params:
            raise ValueError("Failed to parse auth URL parameters")

        write_progress(20, "Fetching gacha records...")

        # Step 3: Fetch records from API
        all_records = []
        uid = None
        region = None

        gacha_types = config["gacha_types"]
        for i, gacha_type in enumerate(gacha_types):
            progress_base = 20 + (i * 70 // len(gacha_types))
            progress_end = 20 + ((i + 1) * 70 // len(gacha_types))

            write_progress(progress_base, f"Fetching banner type {gacha_type}...")

            records, fetched_uid, fetched_region = self.fetch_gacha_records(
                config["api_endpoint"],
                auth_params,
                gacha_type,
                last_id,
                lambda p: write_progress(
                    progress_base + int(p * (progress_end - progress_base) / 100),
                    f"Fetching banner type {gacha_type}..."
                )
            )

            all_records.extend(records)

            if fetched_uid:
                uid = fetched_uid
            if fetched_region:
                region = fetched_region

        write_progress(95, "Processing results...")

        if not uid and all_records:
            uid = all_records[0].get("uid", "unknown")

        write_log(f"Fetched {len(all_records)} records for UID {uid}")
        write_progress(100, "Complete")

        return {
            "uid": uid or "unknown",
            "records": all_records,
            "region": region,
        }

    def extract_auth_url(self, game_path: str, config: Dict) -> Optional[str]:
        """Extract auth URL from game's web cache."""
        import os

        cache_path = os.path.join(game_path, config["cache_path"])

        write_log(f"Looking for cache at: {cache_path}")

        if not os.path.exists(cache_path):
            # Try alternate cache locations
            alternate_paths = [
                cache_path,
                cache_path.replace("webCaches", "webCaches/2.24.0.0"),
                cache_path.replace("webCaches", "webCaches/2.25.0.0"),
                cache_path.replace("webCaches", "webCaches/2.26.0.0"),
            ]

            for alt_path in alternate_paths:
                if os.path.exists(alt_path):
                    cache_path = alt_path
                    break
            else:
                # Search for any version - sort by version number descending to get newest first
                base_cache_dir = os.path.join(game_path, os.path.dirname(config["cache_path"]).replace("Cache/Cache_Data", ""))
                if os.path.exists(base_cache_dir):
                    version_dirs = [d for d in os.listdir(base_cache_dir) if os.path.isdir(os.path.join(base_cache_dir, d))]
                    # Sort by version number (e.g., "2.44.0.0" > "2.40.0.0")
                    version_dirs.sort(key=lambda v: [int(x) for x in v.split('.') if x.isdigit()], reverse=True)
                    for version_dir in version_dirs:
                        potential_path = os.path.join(base_cache_dir, version_dir, "Cache/Cache_Data/data_2")
                        if os.path.exists(potential_path):
                            cache_path = potential_path
                            break

        if not os.path.exists(cache_path):
            write_log(f"Cache file not found at: {cache_path}", level="error")
            return None

        write_log(f"Reading cache from: {cache_path}")

        try:
            with open(cache_path, "rb") as f:
                content = f.read()

            # Search for auth URL using pattern
            pattern = config["url_pattern"]
            matches = re.findall(pattern, content)

            if not matches:
                write_log("No auth URL found in cache", level="warning")
                return None

            # Get the last (most recent) match and decode it
            url_bytes = matches[-1]

            # Clean up the URL - remove any trailing null bytes and invalid characters
            url_str = url_bytes.decode("utf-8", errors="ignore")
            url_str = url_str.split("\x00")[0]  # Stop at first null byte
            url_str = url_str.strip()

            # Validate it's a proper URL
            if not url_str.startswith("https://"):
                return None

            write_log(f"Found auth URL (length: {len(url_str)})")
            return url_str

        except Exception as e:
            write_log(f"Error reading cache: {e}", level="error")
            return None

    def parse_auth_url(self, url: str) -> Optional[Dict[str, str]]:
        """Parse auth parameters from URL."""
        try:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)

            # Flatten the params (parse_qs returns lists)
            flat_params = {k: v[0] if v else "" for k, v in params.items()}

            # Required params
            required = ["authkey", "authkey_ver", "sign_type", "game_biz", "lang"]
            for req in required:
                if req not in flat_params:
                    write_log(f"Missing required param: {req}", level="warning")

            return flat_params

        except Exception as e:
            write_log(f"Error parsing URL: {e}", level="error")
            return None

    def fetch_gacha_records(
        self,
        endpoint: str,
        auth_params: Dict[str, str],
        gacha_type: str,
        last_id: Optional[str],
        progress_callback,
    ) -> tuple[List[Dict], Optional[str], Optional[str]]:
        """Fetch gacha records from API with pagination."""
        records = []
        end_id = "0"
        uid = None
        region = None
        page = 0
        max_pages = 100  # Safety limit

        while page < max_pages:
            page += 1

            # Build request params
            params = {
                **auth_params,
                "gacha_type": gacha_type,
                "page": str(page),
                "size": "20",
                "end_id": end_id,
            }

            try:
                url = f"{endpoint}?{urlencode(params)}"
                response = requests.get(url, timeout=30)
                response.raise_for_status()

                data = response.json()

                if data.get("retcode") != 0:
                    error_msg = data.get("message", "Unknown API error")
                    if data.get("retcode") == -101:
                        raise ValueError("Auth key expired. Please re-open the wish/warp history in-game.")
                    write_log(f"API error: {error_msg} (code: {data.get('retcode')})", level="error")
                    break

                result_data = data.get("data", {})
                items = result_data.get("list", [])

                if not items:
                    break

                # Extract region from first response
                if not region and result_data.get("region"):
                    region = result_data["region"]

                for item in items:
                    record_id = item.get("id", "")

                    # Stop if we've reached records we already have
                    if last_id and record_id <= last_id:
                        return records, uid, region

                    record = {
                        "id": record_id,
                        "uid": item.get("uid", ""),
                        "gacha_type": item.get("gacha_type", gacha_type),
                        "item_id": item.get("item_id"),
                        "name": item.get("name", ""),
                        "item_type": item.get("item_type", ""),
                        "rank_type": item.get("rank_type", "3"),
                        "time": item.get("time", ""),
                    }
                    records.append(record)

                    if not uid and record["uid"]:
                        uid = record["uid"]

                # Update end_id for next page
                end_id = items[-1].get("id", "0")

                # Progress update
                progress_callback(min(100, page * 10))

                # Rate limiting - be nice to the API
                time.sleep(0.3)

            except requests.RequestException as e:
                write_log(f"Request error: {e}", level="error")
                break
            except ValueError:
                raise
            except Exception as e:
                write_log(f"Error fetching records: {e}", level="error")
                break

        return records, uid, region


if __name__ == "__main__":
    run_worker(GachaHistoryWorker)
