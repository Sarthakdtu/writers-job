# Google Sign-In Implementation Plan

## Overview
Implement Google OAuth2 Sign-In to allow users to connect a single "Global Active Account." This allows users to switch between different Google accounts by disconnecting and reconnecting. The connected account will be used for Google Drive backups (future) and will be displayed in the UI.

## 1. Backend: `GoogleAuthService`
Create a new service `backend/app/google_auth.py` to manage the OAuth lifecycle.

### Responsibilities:
- **OAuth Flow**: Generate auth URLs, handle callbacks, exchange codes for tokens.
- **Token Storage**: Persist `google_token.json` and `active_account.json` in `data/.credentials/`.
- **User Info**: Fetch email, name, and profile picture from Google's People API.
- **Revocation**: Handle account disconnection by revoking tokens with Google.

### Key Methods:
- `start_auth()`: Returns `(auth_url, state)`. Stores the Flow object in memory.
- `handle_callback(code, state)`: Exchanges code for tokens, fetches user info, saves `active_account.json`, and returns the account profile.
- `get_status()`: Returns `GoogleAuthStatus` (connected, account info, client_secret availability).
- `disconnect()`: Revokes the token with Google and deletes local storage.
- `get_credentials()`: Returns valid credentials, auto-refreshing if needed.

## 2. Backend: API Routes
Update `backend/app/main.py` to wire up the auth service.

### New/Updated Routes:
- **`GET /api/auth/google`**: Initiates OAuth. Returns `auth_url` if not connected, or current status if connected.
- **`GET /api/auth/google/callback`**: Handles Google's redirect. Exchanges code, saves credentials, and returns an HTML page that `postMessage`s the profile to the opener window and closes itself.
- **`GET /api/auth/google/status`**: Returns `GoogleAuthStatus` (connected/account info).
- **`POST /api/auth/google/disconnect`**: Calls `auth_service.disconnect()` and clears local state.

### Schemas:
Add `GoogleAccount` and `GoogleAuthStatus` Pydantic models to `backend/app/schemas.py`.

## 3. Frontend: Connection State
Update `frontend/src/context/StoryContext.jsx` to track the Google connection status globally.

### New State:
- `googleConnected`: Boolean indicating if an account is linked.
- `googleProfile`: Object containing `{ email, name, picture }`.
- `setGoogleAccount(profile)`: Updates state and persists to `localStorage`.
- `refreshGoogleAccount()`: Fetches `GET /api/auth/google/status` and updates state (runs on mount).

## 4. Frontend: Google Drive Modal
Update `frontend/src/components/GoogleDriveModal.jsx` to handle the full Sign-In lifecycle.

### Two-State UI:
1.  **Not Connected**:
    - Show a "Connect to Google Account" button.
    - On click: Open a popup to `GET /api/auth/google` -> `auth_url`.
    - Listen for `postMessage` from the callback page to receive the profile.
2.  **Connected**:
    - Show an **Account Card** with Name, Email, and Profile Picture.
    - Show a "Disconnect" button (calls `POST /api/auth/google/disconnect`).
    - Show the existing "Sync Status" and "Sync to Google Drive" UI (only visible when connected).

## 5. Frontend: Navbar Badge
Update `frontend/src/components/Navbar.jsx` to show connection status.

### Dynamic Badge:
- **Connected**: Emerald "Connected" badge (or user avatar).
- **Not Connected**: Amber "Connect" badge.

## 6. Security & Storage
- **Storage**: Tokens stored in `data/.credentials/` (git-ignored).
- **Permissions**: `google_token.json` is `chmod 0600` (owner-only read).
- **Scopes**: Request `drive.file`, `userinfo.email`, and `userinfo.profile`.
- **CSRF**: Use OAuth `state` parameter to prevent cross-site request forgery.
- **Revocation**: Tokens are revoked with Google upon disconnect.

## 7. File Manifest
| File | Action | Description |
|------|--------|-------------|
| `backend/app/google_auth.py` | **Create** | `GoogleAuthService` class |
| `backend/app/schemas.py` | **Modify** | Add `GoogleAccount`, `GoogleAuthStatus` models |
| `backend/app/main.py` | **Modify** | Add/Update auth routes, wire up service |
| `frontend/src/context/StoryContext.jsx` | **Modify** | Add `googleConnected`/`googleProfile` state |
| `frontend/src/components/GoogleDriveModal.jsx` | **Modify** | Add Connect/Account Card/Disconnect UI |
| `frontend/src/components/Navbar.jsx` | **Modify** | Dynamic connection badge |

This plan satisfies the "different accounts" requirement by allowing users to switch the active account via the Disconnect/Connect flow.
