import React, { useState, useEffect, useRef } from 'react';
import { CloudUpload, X, Check, RefreshCw, AlertCircle, Sparkles, LogIn, LogOut, User } from 'lucide-react';
import { useStory } from '../context/StoryContext';

export const GoogleDriveModal = ({ onClose }) => {
  const { activeStory, googleConnected, googleProfile, setGoogleAccount, refreshGoogleAccount } = useStory();
  const [syncStatus, setSyncStatus] = useState({
    status: 'in_sync',
    last_sync_time: null,
    total_files_synced: 0,
    error_message: null
  });
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const oauthPopupRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/backup/status');
      if (res.ok) {
        setSyncStatus(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch backup status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    refreshGoogleAccount();
  }, [refreshGoogleAccount]);

  useEffect(() => {
    const onMessage = async (event) => {
      if (event.data && event.data.type === 'google-auth-success') {
        setConnecting(false);
        await refreshGoogleAccount();
        if (oauthPopupRef.current) oauthPopupRef.current.close();
        setToastMessage(`Connected as ${event.data.email}`);
      } else if (event.data && event.data.type === 'google-auth-error') {
        setConnecting(false);
        if (oauthPopupRef.current) oauthPopupRef.current.close();
        setToastMessage(`Connection Error: ${event.data.error}`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshGoogleAccount]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const res = await fetch('/api/auth/google');
      const data = await res.json();

      if (data.auth_url) {
        oauthPopupRef.current = window.open(data.auth_url, 'googleOAuth', 'width=520,height=600');
      } else if (data.connected && data.account) {
        setGoogleAccount(data.account);
        setToastMessage(`Already connected as ${data.account.email}`);
        setConnecting(false);
      } else {
        setToastMessage('Could not initiate Google Sign-In. Check client_secret.json.');
        setConnecting(false);
      }
    } catch (err) {
      console.error('Failed to initiate auth:', err);
      setToastMessage('Failed to communicate with server.');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch('/api/auth/google/disconnect', { method: 'POST' });
      setGoogleAccount(null);
      setToastMessage('Google account disconnected.');
      setSyncStatus({
        status: 'in_sync',
        last_sync_time: null,
        total_files_synced: 0,
        error_message: null
      });
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setToastMessage('Failed to disconnect account.');
    }
  };

  const handleTriggerSync = async () => {
    try {
      setSyncing(true);
      setToastMessage(null);

      const url = activeStory
        ? `/api/backup/google-drive?story_id=${activeStory.id}`
        : '/api/backup/google-drive';

      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSyncStatus({
          status: 'in_sync',
          last_sync_time: data.last_sync,
          total_files_synced: data.files_synced,
          error_message: null
        });
        setToastMessage(`Backup Complete! ${data.files_synced} files synced to Google Drive.`);
      } else {
        const errData = await res.json();
        setSyncStatus((prev) => ({ ...prev, status: 'error', error_message: errData.detail }));
        setToastMessage(`Backup Error: ${errData.detail}`);
      }
    } catch (err) {
      console.error('Backup request failed:', err);
      setSyncStatus((prev) => ({ ...prev, status: 'error', error_message: err.message }));
      setToastMessage('Backup Error: Unable to communicate with server.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[var(--accent-light)] p-2.5 text-[var(--accent)]">
              <CloudUpload className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
                Google Drive Backup
              </h3>
              <p className="text-xs text-[var(--text-muted)]">Sync your stories to the cloud</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!googleConnected ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="rounded-full bg-[var(--bg-base)] p-4 text-[var(--text-muted)]">
              <User className="h-8 w-8" />
            </div>
            <p className="text-sm text-[var(--text-main)] text-center font-medium">
              Connect your Google Account to enable Drive backup and syncing.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
            >
              {connecting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>{connecting ? 'Connecting...' : 'Connect to Google Account'}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-4">
              {googleProfile?.picture ? (
                <img src={googleProfile.picture} alt="" className="h-10 w-10 rounded-full" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] font-bold">
                  {googleProfile?.name?.[0] || 'G'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--text-main)] truncate">{googleProfile?.name}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{googleProfile?.email}</p>
              </div>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Disconnect</span>
              </button>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-main)]">Backup Status:</span>
                {syncing ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-600">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Syncing...
                  </span>
                ) : syncStatus.status === 'in_sync' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                    <Check className="h-3 w-3" /> In Sync
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-600">
                    <AlertCircle className="h-3 w-3" /> Error
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--text-muted)] space-y-1">
                <div>
                  Last Synced: <span className="font-mono text-[var(--text-main)] font-semibold">{syncStatus.last_sync_time || 'Never'}</span>
                </div>
                <div>
                  Files Synced: <span className="font-mono text-[var(--text-main)] font-semibold">{syncStatus.total_files_synced}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {toastMessage && (
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
            toastMessage.includes('Error') ? 'bg-red-500/10 text-red-600 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
          }`}>
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            Close
          </button>
          {googleConnected && (
            <button
              onClick={handleTriggerSync}
              disabled={syncing}
              className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync to Google Drive'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
