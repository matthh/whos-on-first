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
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <a
            href="/"
            className="text-sm text-[#002d62] hover:underline"
          >
            Back to app
          </a>
        </div>
      </header>

      <div className="space-y-3">
        {users.map((user) => (
          <div
            key={user.id}
            className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-800">
                  {user.name || user.email}
                </span>
                {user.role === "admin" && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                    Admin
                  </span>
                )}
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
              </div>
              <div className="text-xs text-gray-400 truncate">
                {user.email} · {user.authProvider || "no auth"} · joined{" "}
                {new Date(user.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {user.status === "pending" && (
                <button
                  onClick={() => updateUser(user.id, { status: "approved" })}
                  className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
                >
                  Approve
                </button>
              )}
              {user.status === "approved" && user.role !== "admin" && (
                <button
                  onClick={() => updateUser(user.id, { status: "suspended" })}
                  className="text-xs px-3 py-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors"
                >
                  Suspend
                </button>
              )}
              {user.status === "suspended" && (
                <button
                  onClick={() => updateUser(user.id, { status: "approved" })}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Reactivate
                </button>
              )}
              {user.role !== "admin" && (
                <button
                  onClick={() => deleteUser(user.id, user.email)}
                  className="text-xs px-2 py-1.5 text-red-400 hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
