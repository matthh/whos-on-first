"use client";

import { useEffect, useRef, useState } from "react";
import { Player, WalkOnSong } from "@/lib/types";

const AVOIDABLE_POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "Rover"];

interface SearchTrack {
  spotifyId: string;
  uri: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  previewUrl: string | null;
  durationMs: number;
}

interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
}

export default function PlayerEditModal({
  player,
  onClose,
  onRename,
  onSetAvoidPositions,
  onSetWalkOnSong,
}: {
  player: Player;
  onClose: () => void;
  onRename: (id: string, name: string) => void;
  onSetAvoidPositions: (id: string, positions: string[]) => void;
  onSetWalkOnSong: (id: string, song: WalkOnSong | null) => void;
}) {
  const [name, setName] = useState(player.name);
  const avoid = player.avoidPositions || [];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Esc to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Stop audio when modal closes
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Spotify status
  useEffect(() => {
    fetch("/api/auth/spotify-status")
      .then((r) => (r.ok ? r.json() : { configured: false, connected: false }))
      .then(setSpotifyStatus)
      .catch(() => setSpotifyStatus({ configured: false, connected: false }));
  }, []);

  // Debounced search
  useEffect(() => {
    if (!spotifyStatus?.connected) return;
    if (!query.trim()) {
      setResults([]);
      setSearchErr(null);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      setSearchErr(null);
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (!res.ok) {
          setSearchErr(data?.error || `Search failed (${res.status})`);
          setResults([]);
        } else {
          setResults(data.tracks || []);
        }
      } catch {
        setSearchErr("Search failed");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, spotifyStatus]);

  const togglePreview = (track: { spotifyId: string; previewUrl: string | null }) => {
    if (!track.previewUrl) return;
    if (playingId === track.spotifyId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(track.previewUrl);
    audio.addEventListener("ended", () => setPlayingId(null));
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(track.spotifyId);
  };

  const toggleAvoid = (pos: string) => {
    const next = avoid.includes(pos) ? avoid.filter((p) => p !== pos) : [...avoid, pos];
    onSetAvoidPositions(player.id, next);
  };

  const selectSong = (t: SearchTrack) => {
    onSetWalkOnSong(player.id, {
      spotifyId: t.spotifyId,
      uri: t.uri,
      title: t.title,
      artist: t.artist,
      albumArtUrl: t.albumArtUrl,
      previewUrl: t.previewUrl,
    });
    audioRef.current?.pause();
    setPlayingId(null);
    setQuery("");
    setResults([]);
  };

  const clearSong = () => {
    if (!confirm("Remove walk-on song?")) return;
    onSetWalkOnSong(player.id, null);
  };

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== player.name) onRename(player.id, trimmed);
  };

  const song = player.walkOnSong;
  const songIsCurrentlyPlaying = song && playingId === song.spotifyId;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl my-8">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Edit Player</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none w-7 h-7 flex items-center justify-center">×</button>
        </div>

        <div className="p-4 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-[#002d62]"
            />
          </div>

          {/* Avoid positions */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Prefer not to play</label>
            <div className="flex flex-wrap gap-1">
              {AVOIDABLE_POSITIONS.map((pos) => {
                const active = avoid.includes(pos);
                return (
                  <button
                    key={pos}
                    onClick={() => toggleAvoid(pos)}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded transition-colors ${
                      active ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {pos}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400">
              Soft preference — applied only if it doesn't impact other players or league rules.
            </p>
          </div>

          {/* Walk-on song */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Walk-on song</label>

            {!spotifyStatus?.configured ? (
              <p className="text-xs text-gray-500">Spotify integration is not configured on this server.</p>
            ) : !spotifyStatus.connected ? (
              <p className="text-xs text-gray-500">
                <a href="/settings" className="text-[#002d62] underline">Connect Spotify in Settings</a> to add a walk-on song.
              </p>
            ) : (
              <>
                {song ? (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-md p-2 bg-gray-50">
                    {song.albumArtUrl ? (
                      <img src={song.albumArtUrl} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center text-gray-400 text-xl flex-shrink-0">♪</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate" title={song.title}>{song.title}</div>
                      <div className="text-xs text-gray-500 truncate" title={song.artist}>{song.artist}</div>
                    </div>
                    {song.previewUrl && (
                      <button
                        type="button"
                        onClick={() => togglePreview({ spotifyId: song.spotifyId, previewUrl: song.previewUrl })}
                        className="text-xs px-2 py-1 rounded bg-[#1DB954] text-white hover:bg-[#1aa84a]"
                        title="Preview 30 seconds"
                      >
                        {songIsCurrentlyPlaying ? "■" : "▶"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearSong}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}

                <div className={song ? "mt-3" : ""}>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={song ? "Change song… (search Spotify)" : "Search Spotify…"}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-[#002d62]"
                  />

                  {searching && <div className="mt-2 text-xs text-gray-500">Searching…</div>}
                  {searchErr && <div className="mt-2 text-xs text-red-600">{searchErr}</div>}

                  {results.length > 0 && (
                    <div className="mt-2 border border-gray-200 rounded-md divide-y divide-gray-100 max-h-72 overflow-y-auto">
                      {results.map((t) => (
                        <div key={t.spotifyId} className="flex items-center gap-2 p-2 hover:bg-gray-50">
                          {t.albumArtUrl ? (
                            <img src={t.albumArtUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">♪</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate" title={t.title}>{t.title}</div>
                            <div className="text-xs text-gray-500 truncate" title={t.artist}>{t.artist}</div>
                          </div>
                          {t.previewUrl ? (
                            <button
                              type="button"
                              onClick={() => togglePreview(t)}
                              className="text-xs px-1.5 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 flex-shrink-0"
                              title="Preview 30 seconds"
                            >
                              {playingId === t.spotifyId ? "■" : "▶"}
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400 flex-shrink-0" title="No preview available">—</span>
                          )}
                          <button
                            type="button"
                            onClick={() => selectSong(t)}
                            className="text-xs px-2 py-1 rounded bg-[#002d62] text-white hover:bg-[#003d82] flex-shrink-0"
                          >
                            Pick
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm font-medium text-white bg-[#002d62] hover:bg-[#003d82] rounded px-3 py-1.5"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
