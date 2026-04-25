"use client";

import { useCallback, useEffect, useState } from "react";

interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  spotifyUserId: string | null;
  displayName: string | null;
}

export default function SpotifyConnect() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/spotify-status");
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      // soft-fail
    }
  }, []);

  // Pick up the OAuth callback redirect (?spotify=connected | error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("spotify");
    if (result === "connected") setFlash("Spotify connected.");
    else if (result === "error") setFlash(`Spotify connection failed: ${params.get("reason") || "unknown"}`);
    if (result) {
      // Strip query so a refresh doesn't replay the flash
      const url = new URL(window.location.href);
      url.searchParams.delete("spotify");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    }
    refresh();
  }, [refresh]);

  const disconnect = async () => {
    if (!confirm("Disconnect Spotify? Walk-on songs will stay on each player but the playlist won't be updated until you reconnect.")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/spotify-disconnect", { method: "POST" });
      await refresh();
      setFlash("Spotify disconnected.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-sm text-gray-500">Loading Spotify status…</div>
    );
  }

  if (!status.configured) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-sm text-gray-500">
        Spotify integration is not configured on this server.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-md p-4 space-y-3">
      {flash && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          {flash}
        </div>
      )}
      {status.connected ? (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">
              Connected{status.displayName ? ` as ${status.displayName}` : ""}
            </div>
            <div className="text-xs text-gray-500">
              Walk-on playlists will be created in this Spotify account.
            </div>
          </div>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">Walk-on music</div>
            <div className="text-xs text-gray-500">
              Connect Spotify to pick a walk-on song per player and auto-build a team playlist when you generate a roster. Optional — generation works without it.
            </div>
          </div>
          <a
            href="/api/auth/spotify-connect"
            className="text-xs font-medium text-white bg-[#1DB954] hover:bg-[#1aa84a] rounded px-3 py-1.5 whitespace-nowrap"
          >
            Connect Spotify
          </a>
        </div>
      )}
    </div>
  );
}
