"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Team = { id: number; name: string; createdAt?: string };

export default function SettingsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/teams");
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error || "Could not load teams");
        setTeams([]);
        setActiveTeamId(null);
      } else {
        const data = await res.json();
        setTeams(data.teams || []);
        setActiveTeamId(data.activeTeamId ?? null);
      }
    } catch {
      setErr("Could not load teams");
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function activate(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${id}`, { method: "POST" });
      if (res.ok) {
        setActiveTeamId(id);
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Could not switch team");
      }
    } finally {
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
        await load();
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
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-sm text-[#002d62] hover:underline">&larr; Back</Link>
        <h1 className="text-2xl font-bold">Team Settings</h1>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : err ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{err}</div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-md divide-y">
            {teams.length === 0 && (
              <div className="p-4 text-sm text-gray-500">No teams yet.</div>
            )}
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
                    <button
                      onClick={() => activate(t.id)}
                      disabled={saving}
                      className="text-xs text-[#002d62] hover:underline"
                    >
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

          <div className="mt-4">
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
                <button
                  onClick={() => { setCreating(false); setNewName(""); }}
                  className="text-sm text-gray-600 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="text-sm text-[#002d62] hover:underline"
              >
                + Add another team
              </button>
            )}
          </div>

          <p className="mt-6 text-xs text-gray-500">
            Switching teams reloads the app with that team&apos;s roster, history, and constraint config.
          </p>
        </>
      )}
    </main>
  );
}
