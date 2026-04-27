"use client";

import { useCallback, useEffect, useState } from "react";

interface SpotifyStatus {
  configured: boolean;
  linked: boolean;
  serviceUserId: string | null;
}

function SyncPlaylistButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "err"; msg: string; url?: string } | null>(null);

  const sync = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/spotify/sync-playlist", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const parts: string[] = [`Synced ${data.trackCount} song${data.trackCount === 1 ? "" : "s"}`];
        if (data.defaulted) parts.push(`${data.defaulted} default-picked`);
        if (data.skipped) parts.push(`${data.skipped} skipped`);
        setResult({ kind: "ok", msg: parts.join(", ") + ".", url: data.playlistUrl });
      } else {
        setResult({ kind: "err", msg: data.reason ? `Sync failed: ${data.reason}` : "Sync failed." });
      }
    } catch {
      setResult({ kind: "err", msg: "Sync failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-2 border-t border-gray-100 mt-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 text-xs text-gray-500">
          Build the team playlist now from current rosters and walk-on songs.
        </div>
        <button
          type="button"
          onClick={sync}
          disabled={busy}
          className="flex-shrink-0 text-xs font-medium text-white bg-[#1DB954] hover:bg-[#1aa84a] rounded px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
        >
          {busy ? "Syncing…" : "Sync playlist now"}
        </button>
      </div>
      {result && (
        <div className={`text-[11px] mt-2 ${result.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>
          {result.msg}
          {result.url && (
            <> · <a href={result.url} target="_blank" rel="noreferrer" className="underline">Open</a></>
          )}
        </div>
      )}
    </div>
  );
}

export default function SpotifyConnect() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/spotify-status");
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      // soft-fail
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (!status) {
    return <div className="border border-gray-200 rounded-md p-4 text-sm text-gray-500">Loading Spotify status…</div>;
  }

  if (!status.configured) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-sm text-gray-500">
        Spotify integration is not configured on this server.
      </div>
    );
  }

  if (!status.linked) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-sm text-gray-500">
        Spotify isn't linked yet. Walk-on song picking and playlist sync will be unavailable until the app owner links a Spotify account in admin.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-md p-4 space-y-3">
      <div className="text-sm text-gray-700">
        Walk-on song picker and playlist sync are enabled.
      </div>
      <div className="text-xs text-gray-500">
        Playlists are created in the app's Spotify account and made public — share the playlist URL with parents and players.
      </div>
      <SyncPlaylistButton />
    </div>
  );
}
