"use client";

import { useState, useEffect, useCallback } from "react";

interface User {
  id: number;
  email: string;
  name: string | null;
  role: string;
  status: string;
  authProvider: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (ms < 60 * 1000) return "just now";
  if (ms < 60 * 60 * 1000) return `${Math.floor(ms / (60 * 1000))}m ago`;
  if (ms < day) return `${Math.floor(ms / (60 * 60 * 1000))}h ago`;
  if (ms < 7 * day) return `${Math.floor(ms / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 403) {
        setError("Access denied. Admin only.");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMessage(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), status: "approved" }),
      });
      if (res.status === 409) {
        setInviteMessage("That email is already registered.");
        return;
      }
      if (!res.ok) throw new Error("Failed to invite");
      setInviteMessage(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      await fetchUsers();
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : "Error");
    } finally {
      setInviting(false);
    }
  };

  const updateUser = async (id: number, updates: Record<string, string>) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update");
      await fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  };

  const deleteUser = async (id: number, email: string) => {
    if (!confirm(`Delete ${email}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }


  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-4 py-6">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#002d62]">Admin</h1>
            <p className="text-sm text-gray-500">Manage coaches</p>
          </div>
          <a href="/" className="text-sm text-[#002d62] hover:underline">
            Back to app
          </a>
        </div>
      </header>

      <SpotifyServiceLink />

      {/* Invite form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Invite a Coach</h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="coach@example.com"
            required
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#002d62]"
          />
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            className={`px-4 py-2 rounded-lg font-bold text-white text-sm transition-colors ${
              inviting || !inviteEmail.trim()
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-[#002d62] hover:bg-[#003d82]"
            }`}
          >
            {inviting ? "Sending..." : "Send Invite"}
          </button>
        </form>
        {inviteMessage && (
          <p className={`text-xs mt-2 ${
            inviteMessage.includes("sent") ? "text-green-600" : "text-red-500"
          }`}>
            {inviteMessage}
          </p>
        )}
        <p className="text-[10px] text-gray-400 mt-1">
          They will be pre-approved and receive a welcome email with a sign-in link.
        </p>
      </div>

      {/* User list */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-bold text-gray-700">
            Coaches ({users.length})
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-xs">
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-center font-medium">Status</th>
              <th className="px-4 py-2 text-center font-medium">Auth</th>
              <th className="px-4 py-2 text-center font-medium">Joined</th>
              <th className="px-4 py-2 text-center font-medium">Login</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      defaultValue={user.email}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val && val !== user.email) {
                          updateUser(user.id, { email: val });
                        }
                      }}
                      className="text-gray-800 bg-transparent border-none outline-none text-sm w-full hover:bg-gray-100 focus:bg-gray-100 rounded px-1 -mx-1"
                    />
                    {user.role === "admin" && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-700 flex-shrink-0">
                        admin
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    defaultValue={user.name || ""}
                    placeholder="--"
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== (user.name || "")) {
                        updateUser(user.id, { name: val });
                      }
                    }}
                    className="text-gray-600 bg-transparent border-none outline-none text-sm w-full hover:bg-gray-100 focus:bg-gray-100 rounded px-1 -mx-1"
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      user.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : user.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center text-gray-400 text-xs">
                  {user.authProvider || "invited"}
                </td>
                <td className="px-4 py-2.5 text-center text-gray-400 text-xs">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td
                  className="px-4 py-2.5 text-center text-gray-400 text-xs"
                  title={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                >
                  {formatLastLogin(user.lastLoginAt)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {user.status === "pending" && (
                      <button
                        onClick={() => updateUser(user.id, { status: "approved" })}
                        className="text-[10px] px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                      >
                        Approve
                      </button>
                    )}
                    {user.status === "approved" && user.role !== "admin" && (
                      <button
                        onClick={() => updateUser(user.id, { status: "suspended" })}
                        className="text-[10px] px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                      >
                        Suspend
                      </button>
                    )}
                    {user.status === "suspended" && (
                      <button
                        onClick={() => updateUser(user.id, { status: "approved" })}
                        className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Reactivate
                      </button>
                    )}
                    {user.role !== "admin" && (
                      <button
                        onClick={() => deleteUser(user.id, user.email)}
                        className="text-[10px] px-2 py-1 text-red-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpotifyServiceLink() {
  const [status, setStatus] = useState<{ configured: boolean; linked: boolean; serviceUserId: string | null } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("spotify_service");
    if (result === "linked") setFlash(`Spotify service account linked${params.get("as") ? ` as ${params.get("as")}` : ""}.`);
    else if (result === "error") setFlash(`Spotify link failed: ${params.get("reason") || "unknown"}`);
    if (result) {
      const url = new URL(window.location.href);
      url.searchParams.delete("spotify_service");
      url.searchParams.delete("reason");
      url.searchParams.delete("as");
      window.history.replaceState({}, "", url.toString());
    }
    fetch("/api/auth/spotify-status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  if (!status) return null;
  if (!status.configured) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h2 className="text-sm font-bold text-gray-700 mb-2">Spotify Service Account</h2>
      <p className="text-xs text-gray-500 mb-3">
        All walk-on-music playlists are created in this single Spotify account on behalf of every coach. Link once; coaches don't authorize Spotify themselves.
      </p>
      {flash && (
        <div className={`text-[11px] mb-2 ${flash.includes("failed") ? "text-red-600" : "text-emerald-700"}`}>{flash}</div>
      )}
      {status.linked ? (
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm text-gray-700">
            Linked as <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{status.serviceUserId}</code>
          </div>
          <a
            href="/api/auth/spotify-service-connect"
            className="text-xs font-medium text-white bg-[#002d62] hover:bg-[#003d82] rounded px-3 py-1.5 whitespace-nowrap"
          >
            Re-link
          </a>
        </div>
      ) : (
        <a
          href="/api/auth/spotify-service-connect"
          className="inline-block text-xs font-medium text-white bg-[#1DB954] hover:bg-[#1aa84a] rounded px-3 py-1.5"
        >
          Link Spotify (admin)
        </a>
      )}
    </div>
  );
}
