import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple, Dict

from app.file_utils import read_json_safe, write_json_safe, delete_file_safe
from app.schemas import GoogleAccount, GoogleAuthStatus


class GoogleAuthService:
    def __init__(self, base_data_dir: Path, client_secret_path: Optional[str] = None):
        self.base_data_dir = Path(base_data_dir)
        self.credentials_dir = self.base_data_dir / ".credentials"
        self.credentials_dir.mkdir(parents=True, exist_ok=True)

        self.token_path = self.credentials_dir / "google_token.json"
        self.active_account_path = self.credentials_dir / "active_account.json"

        self.client_secret_path = Path(
            client_secret_path or os.getenv("GOOGLE_CLIENT_SECRET_PATH", "client_secret.json")
        )

        self.scopes = [
            "openid",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
        ]

        self._pending_flows: Dict[str, object] = {}

    def has_client_secret(self) -> bool:
        return self.client_secret_path.exists()

    def start_auth(self) -> Tuple[str, str]:
        if not self.has_client_secret():
            raise ValueError(
                "client_secret.json not found. Create a Google Cloud OAuth Desktop App "
                "client and download the JSON to the repo root (or set GOOGLE_CLIENT_SECRET_PATH)."
            )
        from google_auth_oauthlib.flow import Flow

        flow = Flow.from_client_secrets_file(
            str(self.client_secret_path),
            scopes=self.scopes,
            redirect_uri="http://localhost:8000/api/auth/google/callback",
        )
        auth_url, state = flow.authorization_url(
            prompt="consent",
            access_type="offline",
            include_granted_scopes="true",
        )
        self._pending_flows[state] = flow
        return auth_url, state

    def handle_callback(self, code: str, state: str) -> GoogleAccount:
        flow = self._pending_flows.pop(state, None)
        if flow is None:
            raise ValueError("Invalid or expired OAuth state. Please try again.")

        flow.fetch_token(code=code)
        credentials = flow.credentials

        self._save_token(credentials)

        import googleapiclient.discovery

        people_service = googleapiclient.discovery.build(
            "people", "v1", credentials=credentials
        )
        person = people_service.people().get(
            resourceName="people/me",
            personFields="names,emailAddresses,photos"
        ).execute()

        name = ""
        email = ""
        picture = ""
        if "names" in person and person["names"]:
            name = person["names"][0].get("displayName", "")
        if "emailAddresses" in person and person["emailAddresses"]:
            email = person["emailAddresses"][0].get("value", "")
        if "photos" in person and person["photos"]:
            picture = person["photos"][0].get("url", "")

        account = GoogleAccount(
            email=email,
            name=name,
            picture=picture,
            connected_at=datetime.utcnow().isoformat() + "Z",
            scopes=list(credentials.scopes or []),
        )
        self._save_active_account(account)
        return account

    def get_status(self) -> GoogleAuthStatus:
        account = self._load_active_account()
        if account and not self.token_path.exists():
            account = None
            self._delete_token()

        return GoogleAuthStatus(
            connected=account is not None,
            account=account,
            client_secret_available=self.has_client_secret(),
        )

    def disconnect(self) -> bool:
        had_account = self._load_active_account() is not None

        creds = self._load_token()
        if creds and creds.token:
            try:
                import requests as http_requests
                http_requests.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": creds.token},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            except Exception:
                pass

        self._delete_token()
        return had_account

    def get_credentials(self):
        creds = self._load_token()
        if creds is None:
            return None

        from google.auth.transport.requests import Request

        if creds.expired or not creds.valid:
            try:
                creds.refresh(Request())
                self._save_token(creds)
            except Exception:
                self._delete_token()
                return None

        return creds

    def get_drive_service(self):
        creds = self.get_credentials()
        if not creds:
            return None
        import googleapiclient.discovery
        return googleapiclient.discovery.build("drive", "v3", credentials=creds)

    def _save_token(self, credentials) -> None:
        token_data = {
            "token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": list(credentials.scopes or []),
            "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
        }
        write_json_safe(self.token_path, token_data)
        try:
            os.chmod(self.token_path, 0o600)
        except OSError:
            pass

    def _load_token(self):
        data = read_json_safe(self.token_path, default=None)
        if not data:
            return None
        try:
            from google.oauth2.credentials import Credentials as OAuthCredentials
            from datetime import datetime

            expiry = None
            if data.get("expiry"):
                expiry = datetime.fromisoformat(data["expiry"])
            return OAuthCredentials(
                token=data.get("token"),
                refresh_token=data.get("refresh_token"),
                token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
                client_id=data.get("client_id"),
                client_secret=data.get("client_secret"),
                scopes=data.get("scopes"),
                expiry=expiry,
            )
        except Exception:
            return None

    def _save_active_account(self, account: GoogleAccount) -> None:
        write_json_safe(self.active_account_path, account.model_dump())

    def _load_active_account(self) -> Optional[GoogleAccount]:
        data = read_json_safe(self.active_account_path, default=None)
        if not data:
            return None
        try:
            return GoogleAccount(**data)
        except Exception:
            return None

    def _delete_token(self) -> None:
        if self.token_path.exists():
            delete_file_safe(self.token_path)
        if self.active_account_path.exists():
            delete_file_safe(self.active_account_path)
