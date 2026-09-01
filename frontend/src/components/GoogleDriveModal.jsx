import React, { useState, useEffect, useRef } from 'react';
import { CloudUpload, X, Check, RefreshCw, AlertCircle, Sparkles, LogIn, LogOut, User, Download, File, Folder } from 'lucide-react';
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
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [showRestoreChooser, setShowRestoreChooser] = useState(false);
  const [availableStories, setAvailableStories] = useState({});
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

  const storyTitle = (slug) => {
    const found = availableStories[slug];
    return found?.title || slug;
  };

  const handlePreviewRestore = async () => {
    try {
      setRestoring(true);
      setToastMessage(null);
      const res = await fetch('/api/backup/restore/preview');
      if (res.ok) {
        const data = await res.json();
        setRestorePreview(data);
        const titles = {};
        try {
          const sres = await fetch('/api/stories');
          if (sres.ok) {
            const all = await sres.json();
            for (const s of all) titles[s.id] = s.title;
          }
        } catch (e) { /* ignore */ }
        setAvailableStories(titles);
        setShowRestoreChooser(true);
      } else {
        const errData = await res.json();
        setToastMessage(`Restore Preview Error: ${errData.detail}`);
        setShowRestoreChooser(false);
      }
    } catch (err) {
      console.error('Restore preview failed:', err);
      setToastMessage('Restore Error: Unable to communicate with server.');
      setShowRestoreChooser(false);
    } finally {
      setRestoring(false);
    }
  };

  const handleExecuteRestore = async (choice) => {
    try {
      setRestoring(true);
      setToastMessage(null);
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
      if (res.ok) {
        const data = await res.json();
        const phr = choice === 'drive'
          ? `Restored ${data.restored_files} file(s) from Drive. ${data.preserved_backups} older local file(s) saved as backup.`
          : `Kept ${data.skipped_conflicts} local file(s). Created ${data.created_files} new file(s) from Drive.`;
        setToastMessage(`Done! ${phr}`);
        setShowRestoreChooser(false);
        setRestorePreview(null);
        await refreshGoogleAccount();
      } else {
        const errData = await res.json();
        setToastMessage(`Restore Error: ${errData.detail}`);
      }
    } catch (err) {
      console.error('Restore failed:', err);
      setToastMessage('Restore Error: Unable to communicate with server.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="flex flex-col w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl max-h-[90vh]">
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

        <div className="overflow-y-auto flex-1 space-y-5 py-4">
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

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Restore from Drive
                </span>
                <button
                  onClick={handlePreviewRestore}
                  disabled={restoring}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-main)] hover:bg-[var(--border-color)] transition-colors cursor-pointer"
                >
                  <Download className={`h-3 w-3 ${restoring ? 'animate-pulse' : ''}`} />
                  {restoring ? 'Checking...' : 'Check for conflicts'}
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                Download your backed-up stories from Drive back to this device. If a file differs
                between here and Drive, you'll be asked which version to restore.
              </p>
            </div>

            {showRestoreChooser && restorePreview && (
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-4 space-y-3 animate-in fade-in">
                <p className="text-xs font-bold text-[var(--text-main)]">Restore Preview</p>
                {Object.keys(restorePreview.stories || {}).length === 0 ? (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    No story backups found in Drive. Sync to Google Drive first.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {Object.entries(restorePreview.stories).map(([slug, info]) => (
                        <div key={slug} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-main)]">
                            <Folder className="h-3 w-3 text-[var(--accent)]" />
                            {storyTitle(slug)}
                          </div>
                          <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px] text-[var(--text-muted)]">
                            <span className="inline-flex items-center gap-1">
                              <AlertCircle className="h-3 w-3 text-amber-500" />
                              {info.conflicts?.length || 0} conflict{info.conflicts?.length === 1 ? '' : 's'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <File className="h-3 w-3 text-blue-500" />
                              {info.remote_only?.length || 0} on Drive only
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Check className="h-3 w-3 text-emerald-500" />
                              {info.in_sync?.length || 0} in sync
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-[var(--text-dim)]" />
                              {info.local_only?.length || 0} local only
                            </span>
                          </div>
                          {info.conflicts?.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {info.conflicts.slice(0, 5).map((p) => (
                                <div key={p} className="truncate text-[10px] font-mono text-amber-600/80">{p}</div>
                              ))}
                              {info.conflicts.length > 5 && (
                                <div className="text-[10px] text-[var(--text-dim)]">+{info.conflicts.length - 5} more</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {restorePreview.total?.conflicts > 0 ? (
                      <>
                        <p className="text-[11px] text-amber-600 bg-amber-500/10 rounded-lg p-2.5 border border-amber-500/20">
                          {restorePreview.total.conflicts} conflicting file(s) found. Choose which version to keep
                          for all conflicts. The other version is preserved as a local backup until your next sync.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleExecuteRestore('drive')}
                            disabled={restoring}
                            className="flex-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Use Drive version
                          </button>
                          <button
                            onClick={() => handleExecuteRestore('local')}
                            disabled={restoring}
                            className="flex-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-[11px] font-semibold text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Keep local version
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        onClick={() => handleExecuteRestore('drive')}
                        disabled={restoring}
                        className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {restoring ? 'Restoring...' : 'Restore from Drive'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
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
        </div>

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
