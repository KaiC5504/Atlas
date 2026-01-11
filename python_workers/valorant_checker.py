#!/usr/bin/env python3
"""
Valorant store checker worker.
Uses captured Riot cookies to authenticate and fetch real store data.
"""
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional
import urllib.parse

# Add common module to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import WorkerBase, run_worker, write_progress, write_log

# Import requests for API calls (used for non-auth requests)
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# Import tls_client for TLS fingerprinting (used for auth requests)
try:
    import tls_client
    HAS_TLS_CLIENT = True
except ImportError:
    HAS_TLS_CLIENT = False
    write_log("Warning: tls_client not installed. Auth may fail due to TLS fingerprinting.")


class ValorantCheckerWorker(WorkerBase):
    """
    Worker for checking the Valorant daily store using Riot authentication.

    Expected input:
    {
        "region": "na" | "eu" | "ap" | "kr",
        "cookies": {
            "tdid": "...",
            "clid": "...",
            "csid": "...",
            "ssid": "...",
            "sub": "..."
        }
    }

    Output:
    {
        "date": "2024-01-15",
        "items": [...],
        "checked_at": "2024-01-15T08:00:00Z",
        "is_real_data": true/false
    }
    """

    # Region to shard mapping
    REGION_SHARD_MAP = {
        "na": "na",
        "latam": "na",
        "br": "na",
        "eu": "eu",
        "ap": "ap",
        "kr": "kr",
        "pbe": "pbe"
    }

    # Base64 encoded client platform (standard value for PC)
    CLIENT_PLATFORM = "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"

    def validate_input(self, input_data: Dict[str, Any]) -> None:
        if not HAS_REQUESTS:
            write_log("Warning: requests library not installed. Using mock data.")

    def _create_tls_session(self, cookies: Dict[str, Optional[str]]) -> Any:
        """
        Create a tls_client session with Chrome fingerprint and set cookies.
        This mimics a real browser to avoid Riot's anti-bot detection.
        """
        if not HAS_TLS_CLIENT:
            return None

        # Create session with Chrome 120 fingerprint
        session = tls_client.Session(
            client_identifier="chrome_120",
            random_tls_extension_order=True
        )

        # Set cookies on the session with proper domain
        for name, value in cookies.items():
            if value:
                session.cookies.set(name, value, domain=".riotgames.com")

        return session

    def _cookie_reauth(self, cookies: Dict[str, Optional[str]]) -> Optional[Dict[str, str]]:
        """
        Use Cookie Reauth to get fresh tokens via POST to /api/v1/authorization.
        Returns dict with access_token, id_token, or None on failure.
        """
        # Create TLS session with Chrome fingerprint
        session = self._create_tls_session(cookies)

        if not session:
            write_log("tls_client not available, falling back to requests (may fail)")
            return self._cookie_reauth_fallback(cookies)

        reauth_url = "https://auth.riotgames.com/api/v1/authorization"

        try:
            # POST request with JSON body (correct method for cookie reauth)
            response = session.post(
                reauth_url,
                headers={"Content-Type": "application/json"},
                json={
                    "client_id": "play-valorant-web-prod",
                    "nonce": "1",
                    "redirect_uri": "https://playvalorant.com/opt_in",
                    "response_type": "token id_token",
                    "scope": "account openid"
                }
            )

            write_log(f"Cookie reauth response status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()

                # Check response type
                resp_type = data.get("type")

                if resp_type == "response":
                    # Success - extract tokens from response.parameters.uri
                    params = data.get("response", {}).get("parameters", {})
                    uri = params.get("uri", "")

                    if "#" in uri:
                        fragment = uri.split("#")[1]
                        token_params = dict(p.split("=", 1) for p in fragment.split("&") if "=" in p)

                        if "access_token" in token_params:
                            write_log("Cookie reauth successful - got fresh tokens")
                            return {
                                "access_token": urllib.parse.unquote(token_params.get("access_token", "")),
                                "id_token": urllib.parse.unquote(token_params.get("id_token", "")),
                                "token_type": token_params.get("token_type", "Bearer"),
                                "expires_in": token_params.get("expires_in", "3600")
                            }

                elif resp_type == "auth":
                    # Need to re-authenticate (cookies expired or invalid)
                    write_log("Cookie reauth failed - auth required (cookies expired)")
                    return None

                elif resp_type == "multifactor":
                    # 2FA required - can't handle automatically
                    write_log("Cookie reauth failed - 2FA required")
                    return None

                else:
                    write_log(f"Cookie reauth unexpected type: {resp_type}")
                    write_log(f"Response data: {str(data)[:500]}")
                    return None

            else:
                write_log(f"Cookie reauth failed with status: {response.status_code}")
                write_log(f"Response: {response.text[:500]}")
                return None

        except Exception as e:
            write_log(f"Cookie reauth request failed: {e}")
            return None

    def _cookie_reauth_fallback(self, cookies: Dict[str, Optional[str]]) -> Optional[Dict[str, str]]:
        """
        Fallback cookie reauth using requests (without TLS fingerprinting).
        Less likely to succeed due to bot detection.
        """
        reauth_url = "https://auth.riotgames.com/api/v1/authorization"
        cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items() if v)

        try:
            response = requests.post(
                reauth_url,
                headers={
                    "Content-Type": "application/json",
                    "Cookie": cookie_header,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                },
                json={
                    "client_id": "play-valorant-web-prod",
                    "nonce": "1",
                    "redirect_uri": "https://playvalorant.com/opt_in",
                    "response_type": "token id_token",
                    "scope": "account openid"
                },
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("type") == "response":
                    params = data.get("response", {}).get("parameters", {})
                    uri = params.get("uri", "")

                    if "#" in uri:
                        fragment = uri.split("#")[1]
                        token_params = dict(p.split("=", 1) for p in fragment.split("&") if "=" in p)

                        if "access_token" in token_params:
                            write_log("Cookie reauth (fallback) successful")
                            return {
                                "access_token": urllib.parse.unquote(token_params.get("access_token", "")),
                                "id_token": urllib.parse.unquote(token_params.get("id_token", "")),
                                "token_type": token_params.get("token_type", "Bearer"),
                                "expires_in": token_params.get("expires_in", "3600")
                            }

            write_log(f"Cookie reauth fallback failed: {response.status_code}")
            return None

        except requests.RequestException as e:
            write_log(f"Cookie reauth fallback error: {e}")
            return None

    def _get_entitlement_token(self, access_token: str) -> Optional[str]:
        """Get entitlement token using access token."""
        url = "https://entitlements.auth.riotgames.com/api/token/v1"

        try:
            response = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={},
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("entitlements_token")

            write_log(f"Entitlement request failed: {response.status_code}")
            return None

        except requests.RequestException as e:
            write_log(f"Entitlement request error: {e}")
            return None

    def _get_player_info(self, access_token: str) -> Optional[Dict[str, Any]]:
        """Get player info including PUUID."""
        url = "https://auth.riotgames.com/userinfo"

        try:
            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                # Log the player info for debugging
                puuid = data.get("sub", "unknown")
                acct = data.get("acct", {})
                game_name = acct.get("game_name", "unknown")
                tag_line = acct.get("tag_line", "unknown")
                write_log(f"Player info: {game_name}#{tag_line} (PUUID: {puuid[:8]}...)")
                return data

            write_log(f"Player info request failed: {response.status_code}")
            return None

        except requests.RequestException as e:
            write_log(f"Player info request error: {e}")
            return None

    def _get_client_version(self) -> str:
        """Get current Valorant client version from valorant-api.com."""
        try:
            response = requests.get(
                "https://valorant-api.com/v1/version",
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                version = data.get("data", {}).get("riotClientVersion", "")
                if version:
                    return version
        except:
            pass
        # Fallback version
        return "release-09.00-shipping-9-2621580"

    def _get_storefront(
        self,
        access_token: str,
        entitlement_token: str,
        puuid: str,
        shard: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch the player's storefront data."""
        client_version = self._get_client_version()
        write_log(f"Using client version: {client_version}")

        headers = {
            "Authorization": f"Bearer {access_token}",
            "X-Riot-Entitlements-JWT": entitlement_token,
            "X-Riot-ClientPlatform": self.CLIENT_PLATFORM,
            "X-Riot-ClientVersion": client_version,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
        }

        try:
            # Use v3 storefront API (POST request)
            url_v3 = f"https://pd.{shard}.a.pvp.net/store/v3/storefront/{puuid}"
            write_log(f"Fetching storefront v3: {url_v3}")
            response = requests.post(url_v3, headers=headers, json={}, timeout=30)

            if response.status_code == 200:
                write_log("Storefront v3 succeeded")
                return response.json()

            write_log(f"Storefront request failed: {response.status_code} - {response.text[:200]}")
            return None

        except requests.RequestException as e:
            write_log(f"Storefront request error: {e}")
            return None

    def _clean_skin_name(self, name: str) -> str:
        """Remove 'Level X' suffix from skin names."""
        import re
        # Remove " Level 1", " Level 2", etc. from the end
        cleaned = re.sub(r'\s+Level\s+\d+$', '', name, flags=re.IGNORECASE)
        return cleaned.strip()

    def _get_skin_info(self, skin_uuid: str) -> Optional[Dict[str, Any]]:
        """Get skin info from valorant-api.com (public API)."""
        # Try skin levels first (most common for store items)
        url = f"https://valorant-api.com/v1/weapons/skinlevels/{skin_uuid}"
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                result = data.get("data")
                if result:
                    # Clean up the name to remove "Level X" suffix
                    original_name = result.get('displayName', 'Unknown')
                    cleaned_name = self._clean_skin_name(original_name)
                    result['displayName'] = cleaned_name
                    write_log(f"Found skin level: {original_name} -> {cleaned_name}")
                    return result
        except Exception as e:
            write_log(f"Skin level lookup failed: {e}")

        # Try skins endpoint as fallback
        url = f"https://valorant-api.com/v1/weapons/skins/{skin_uuid}"
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                result = data.get("data")
                if result:
                    write_log(f"Found skin: {result.get('displayName', 'Unknown')}")
                    return result
        except Exception as e:
            write_log(f"Skin lookup failed: {e}")

        write_log(f"Could not find skin info for UUID: {skin_uuid}")
        return None

    def _parse_storefront(self, storefront: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse storefront data into item list."""
        items = []

        # Log the storefront structure for debugging
        write_log(f"Storefront keys: {list(storefront.keys())}")

        # Get daily offers from SkinsPanelLayout
        skins_panel = storefront.get("SkinsPanelLayout", {})
        if not skins_panel:
            write_log("No SkinsPanelLayout found in storefront!")
            write_log(f"Storefront content sample: {str(storefront)[:500]}")
            return items

        # Log store reset timer
        reset_seconds = skins_panel.get("SingleItemOffersRemainingDurationInSeconds", 0)
        if reset_seconds:
            hours = reset_seconds // 3600
            minutes = (reset_seconds % 3600) // 60
            write_log(f"Store resets in: {hours}h {minutes}m ({reset_seconds}s)")

        single_offers = skins_panel.get("SingleItemStoreOffers", [])
        write_log(f"Found {len(single_offers)} offers in SingleItemStoreOffers")

        # Also check for SingleItemOffers (alternative key name)
        if not single_offers:
            single_offers = skins_panel.get("SingleItemOffers", [])
            write_log(f"Trying SingleItemOffers: found {len(single_offers)}")

        # VP currency UUID
        VP_UUID = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"

        for idx, offer in enumerate(single_offers):
            write_log(f"Processing offer {idx + 1}: keys = {list(offer.keys())}")

            # Get cost
            cost_info = offer.get("Cost", {})
            vp_cost = cost_info.get(VP_UUID, 0)

            # Get the offer ID which might be the skin UUID directly
            offer_id = offer.get("OfferID", "")

            # Get rewards
            rewards = offer.get("Rewards", [])
            write_log(f"Offer {idx + 1}: cost={vp_cost}, rewards={len(rewards)}, offerID={offer_id[:20] if offer_id else 'N/A'}...")

            if rewards:
                for reward in rewards:
                    item_uuid = reward.get("ItemID", "")
                    item_type_id = reward.get("ItemTypeID", "")
                    write_log(f"  Reward: ItemID={item_uuid[:20] if item_uuid else 'N/A'}..., TypeID={item_type_id[:20] if item_type_id else 'N/A'}...")

                    # Get skin info from public API
                    skin_info = self._get_skin_info(item_uuid)

                    item = {
                        "name": skin_info.get("displayName", "Unknown Skin") if skin_info else f"Skin {item_uuid[:8]}",
                        "price": vp_cost,
                        "image_url": skin_info.get("displayIcon") if skin_info else None,
                        "item_type": "skin",
                        "uuid": item_uuid
                    }
                    items.append(item)
            else:
                # If no rewards, try using OfferID directly
                if offer_id:
                    write_log(f"  No rewards, trying OfferID as skin UUID")
                    skin_info = self._get_skin_info(offer_id)
                    item = {
                        "name": skin_info.get("displayName", "Unknown Skin") if skin_info else f"Skin {offer_id[:8]}",
                        "price": vp_cost,
                        "image_url": skin_info.get("displayIcon") if skin_info else None,
                        "item_type": "skin",
                        "uuid": offer_id
                    }
                    items.append(item)

        write_log(f"Total items parsed: {len(items)}")
        return items

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        region = input_data.get("region", "ap")
        cookies = input_data.get("cookies")

        shard = self.REGION_SHARD_MAP.get(region, "ap")

        write_log(f"Starting Valorant store check for region: {region}, shard: {shard}")
        write_progress(0, "Initializing...")

        items = []
        use_mock = True

        # Try real API if we have cookies
        if cookies and cookies.get("ssid"):
            write_progress(10, "Authenticating with Riot...")

            # Build cookies dict
            cookie_dict = {
                "tdid": cookies.get("tdid"),
                "clid": cookies.get("clid"),
                "csid": cookies.get("csid"),
                "ssid": cookies.get("ssid"),
                "sub": cookies.get("sub"),
            }

            # Cookie reauth to get fresh tokens
            write_progress(20, "Refreshing authentication tokens...")
            tokens = self._cookie_reauth(cookie_dict)

            if tokens and tokens.get("access_token"):
                access_token = tokens["access_token"]

                write_progress(30, "Getting entitlement token...")
                entitlement_token = self._get_entitlement_token(access_token)

                if entitlement_token:
                    write_progress(40, "Getting player info...")
                    player_info = self._get_player_info(access_token)

                    # IMPORTANT: Always use PUUID from fresh userinfo, NOT from stored cookies
                    # Using old cookie PUUID could return wrong account's store
                    if player_info and player_info.get("sub"):
                        puuid = player_info["sub"]
                        write_log(f"Using PUUID from userinfo: {puuid[:8]}...")
                    else:
                        write_log("WARNING: Could not get PUUID from userinfo, falling back to cookie")
                        puuid = cookies.get("sub")
                        if puuid:
                            write_log(f"Using PUUID from cookie: {puuid[:8]}...")

                    if puuid:
                        write_progress(60, "Fetching storefront...")
                        storefront = self._get_storefront(
                            access_token,
                            entitlement_token,
                            puuid,
                            shard
                        )

                        if storefront:
                            write_progress(80, "Parsing store data...")
                            items = self._parse_storefront(storefront)
                            use_mock = False
                            write_log(f"Got {len(items)} items from real store")
                        else:
                            write_log("Failed to get storefront data")
                    else:
                        write_log("Failed to get PUUID")
                else:
                    write_log("Failed to get entitlement token")
            else:
                write_log("Cookie reauth failed - cookies may be expired")
        else:
            write_log("No cookies provided - auth required")

        # If auth failed, return empty items
        if use_mock:
            write_log("Auth failed - returning empty store")
            write_progress(100, "Check failed - auth required")
            items = []

        write_progress(100, "Store check complete!")

        now = datetime.utcnow()
        return {
            "date": now.strftime("%Y-%m-%d"),
            "items": items,
            "checked_at": now.isoformat() + "Z",
            "is_real_data": not use_mock
        }


if __name__ == "__main__":
    run_worker(ValorantCheckerWorker)
