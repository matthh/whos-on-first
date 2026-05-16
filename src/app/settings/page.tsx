"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ConstraintsPanel from "@/components/ConstraintsPanel";
import SpotifyConnect from "@/components/SpotifyConnect";
import { ConstraintConfig, DEFAULT_CONFIG, migrateRestrictions } from "@/lib/constraints";

type Team = { id: number; name: string; createdAt?: string; walkOnPlaylistUrl?: string | null };

export default function SettingsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);
  const [activeTeamName, setActiveTeamName] = useState("");
  const [config, setConfig] = useState<ConstraintConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistErr, setPlaylistErr] = useState<string | null>(null);
  const [playlistSaving, setPlaylistSaving] = useState(false);
  const [playlistSaved, setPlaylistSaved] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  const mergeConfig = (saved: Partial<ConstraintConfig> | null | undefined): ConstraintConfig => {
    if (!saved) return DEFAULT_CONFIG;
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      positioning: { ...DEFAULT_CONFIG.positioning, ...(saved.positioning || {}) },
      restrictions: migrateRestrictions(saved.restrictions),
      innings: saved.innings ?? DEFAULT_CONFIG.innings,
      fieldPositions: saved.fieldPositions || DEFAULT_CONFIG.fieldPositions,
      maxInningsPitched:
        saved.maxInningsPitched !== undefined ? saved.maxInningsPitched : DEFAULT_CONFIG.maxInningsPitched,
      trackRecognition: saved.trackRecognition ?? DEFAULT_CONFIG.trackRecognition,
    };
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [teamsRes, rosterRes] = await Promise.all([
        fetch("/api/teams").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/roster").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!teamsRes) {
        setErr("Could not load teams");
        return;
      }
      setTeams(teamsRes.teams || []);
      setActiveTeamId(teamsRes.activeTeamId ?? null);
      const active = (teamsRes.teams || []).find((t: Team) => t.id === teamsRes.activeTeamId);
      setActiveTeamName(active?.name || "");
      setPlaylistUrl(active?.walkOnPlaylistUrl || "");
      setPlaylistErr(null);
      setConfig(mergeConfig(rosterRes?.config || null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Debounced auto-save of config changes from ConstraintsPanel
  useEffect(() => {
    if (!config) return;
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch("/api/roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      }).catch(() => {});
    }, 500);
  }, [config]);

  async function activate(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${id}`, { method: "POST" });
      if (res.ok) {
        // Reload everything (including config) for the newly-active team
        window.location.reload();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Could not switch team");
        setSaving(false);
      }
    } catch {
      setSaving(false);
    }
  }

  async function saveRename(id: number) {
    const name = renameDraft.trim();
    if (!name) { setRenamingId(null); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Could not rename team");
      } else {
        setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
        if (id === activeTeamId) setActiveTeamName(name);
        setRenamingId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam(id: number, name: string) {
    if (!confirm(`Delete "${name}" and all of its roster + game history? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Could not delete team");
      } else {
        await loadAll();
      }
    } finally {
      setSaving(false);
    }
  }

  async function createTeam() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Could not create team");
      } else {
        setNewName("");
        setCreating(false);
        // New team is auto-activated server-side; reload so everything is fresh
        window.location.reload();
      }
    } finally {
      setSaving(false);
    }
  }

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !config) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo must be smaller than 2MB");
      return;
    }
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (dataUrl) {
        setConfig({ ...config, logoDataUrl: dataUrl });
      }
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    };
    reader.onerror = () => {
      alert("Could not read logo file");
      setLogoUploading(false);
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    if (!config) return;
    setConfig({ ...config, logoDataUrl: null });
  }

  if (loading || !config) {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-sm text-[#002d62] hover:underline">&larr; Back</Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        <div className="text-sm text-gray-500">Loading…</div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-sm text-[#002d62] hover:underline">&larr; Back</Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{err}</div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-[#002d62] hover:underline">&larr; Back</Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Active team details */}
      <section>
        <h2 className="text-lg font-semibold mb-3">
          Active team{activeTeamName ? ` — ${activeTeamName}` : ""}
        </h2>
        <div className="border border-gray-200 rounded-md p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Team name</label>
            <input
              value={config.teamName || ""}
              maxLength={60}
              onChange={(e) => setConfig({ ...config, teamName: e.target.value })}
              className="text-sm border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:border-[#002d62]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Team logo</label>
            <div className="flex items-center gap-3">
              {config.logoDataUrl ? (
                <img src={config.logoDataUrl} alt="Team logo" className="w-12 h-12 object-contain border border-gray-200 rounded" />
              ) : (
                <div className="w-12 h-12 border border-dashed border-gray-300 rounded flex items-center justify-center text-xs text-gray-400">none</div>
              )}
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                className="text-xs text-[#002d62] hover:underline"
              >
                {logoUploading ? "Uploading…" : config.logoDataUrl ? "Replace logo" : "Upload logo"}
              </button>
              {config.logoDataUrl && (
                <button type="button" onClick={clearLogo} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onLogoFile}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Max 2MB. PNG with transparent background works best.</p>
          </div>
        </div>
      </section>

      {/* Spotify integration */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Spotify</h2>
        <SpotifyConnect />
        <div className="mt-4 border-t border-gray-200 pt-4">
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Walk-on playlist URL <span className="text-xs font-normal text-gray-500">(for the QR on the printout)</span>
          </label>
          <p className="text-[12px] text-gray-500 mb-2">
            Paste any public Spotify playlist URL. We&apos;ll render it as a QR code on the walk-on music sheet so parents can scan and play it.
          </p>
          <div className="flex gap-2 items-start">
            <input
              type="url"
              inputMode="url"
              placeholder="https://open.spotify.com/playlist/..."
              value={playlistUrl}
              onChange={(e) => { setPlaylistUrl(e.target.value); setPlaylistErr(null); setPlaylistSaved(false); }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
            />
            <button
              type="button"
              disabled={!activeTeamId || playlistSaving}
              onClick={async () => {
                if (!activeTeamId) return;
                setPlaylistSaving(true);
                setPlaylistErr(null);
                setPlaylistSaved(false);
                try {
                  const res = await fetch(`/api/teams/${activeTeamId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ walkOnPlaylistUrl: playlistUrl.trim() || null }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setPlaylistErr(data?.error || "Failed to save");
                  } else {
                    setPlaylistSaved(true);
                    setTeams((prev) => prev.map((t) => t.id === activeTeamId ? { ...t, walkOnPlaylistUrl: data.team?.walkOnPlaylistUrl ?? null } : t));
                    setTimeout(() => setPlaylistSaved(false), 2000);
                  }
                } catch (err) {
                  setPlaylistErr(err instanceof Error ? err.message : "Failed to save");
                } finally {
                  setPlaylistSaving(false);
                }
              }}
              className="px-4 py-2 rounded-md text-sm font-semibold bg-[#002d62] text-white hover:bg-[#001e44] disabled:opacity-50"
            >
              {playlistSaving ? "Saving…" : "Save"}
            </button>
          </div>
          {playlistErr && <p className="text-xs text-red-600 mt-1">{playlistErr}</p>}
          {playlistSaved && <p className="text-xs text-green-600 mt-1">Saved.</p>}
        </div>
      </section>

      {/* Teams list */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Your teams</h2>
        <div className="border border-gray-200 rounded-md divide-y">
          {teams.map((t) => {
            const isActive = t.id === activeTeamId;
            const isRenaming = renamingId === t.id;
            return (
              <div key={t.id} className="flex items-center gap-2 p-3">
                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(t.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => saveRename(t.id)}
                      maxLength={60}
                      className="text-sm border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:border-[#002d62]"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isActive ? "font-semibold text-[#002d62]" : "text-gray-800"}`}>
                        {t.name}
                      </span>
                      {isActive && (
                        <span className="text-xs bg-[#002d62] text-white px-1.5 py-0.5 rounded">Active</span>
                      )}
                    </div>
                  )}
                </div>
                {!isRenaming && !isActive && (
                  <button onClick={() => activate(t.id)} disabled={saving} className="text-xs text-[#002d62] hover:underline">
                    Switch to
                  </button>
                )}
                {!isRenaming && (
                  <button
                    onClick={() => { setRenameDraft(t.name); setRenamingId(t.id); }}
                    disabled={saving}
                    className="text-xs text-gray-600 hover:underline"
                  >
                    Rename
                  </button>
                )}
                {!isRenaming && teams.length > 1 && (
                  <button
                    onClick={() => deleteTeam(t.id, t.name)}
                    disabled={saving}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3">
          {creating ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createTeam();
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
                }}
                placeholder="New team name"
                maxLength={60}
                className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:border-[#002d62]"
              />
              <button
                onClick={createTeam}
                disabled={saving || !newName.trim()}
                className="text-sm bg-[#002d62] text-white px-3 py-1 rounded hover:bg-[#00204a] disabled:opacity-50"
              >
                Add team
              </button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="text-sm text-gray-600 hover:underline">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="text-sm text-[#002d62] hover:underline">
              + Add another team
            </button>
          )}
        </div>
      </section>

      {/* Game rules */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Game rules</h2>
        <p className="text-xs text-gray-500 mb-3">
          Controls positioning constraints, innings played, pitcher limits, and per-position restrictions for{" "}
          <strong>{activeTeamName || "this team"}</strong>.
        </p>
        <ConstraintsPanel config={config} onChange={setConfig} onClose={() => { /* no-op in settings */ }} />
      </section>
    </main>
  );
}
