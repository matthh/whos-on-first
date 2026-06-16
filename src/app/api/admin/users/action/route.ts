import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { verifyOAuthState } from "@/lib/auth";
import { sendApprovalNotification } from "@/lib/email";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return new Response(html("Missing token", "error"), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const data = verifyOAuthState(token);
  if (!data || typeof data.userId !== "number" || typeof data.action !== "string") {
    return new Response(html("Invalid or expired link", "error"), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  if (typeof data.exp === "number" && data.exp < Date.now()) {
    return new Response(html("This link has expired. Please use the admin panel instead.", "error"), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const [user] = await db.select().from(users).where(eq(users.id, data.userId)).limit(1);
  if (!user) {
    return new Response(html("User not found", "error"), { status: 404, headers: { "Content-Type": "text/html" } });
  }

  if (data.action === "approve") {
    if (user.status === "approved") {
      return new Response(html(`${user.name || user.email} is already approved.`, "info"), { headers: { "Content-Type": "text/html" } });
    }
    await db.update(users).set({ status: "approved" }).where(eq(users.id, data.userId));
    sendApprovalNotification(user.email, user.name).catch(err =>
      console.error("[ACTION] Failed to send approval email:", err)
    );
    return new Response(html(`${user.name || user.email} has been approved. They've been notified by email.`, "success"), { headers: { "Content-Type": "text/html" } });
  }

  if (data.action === "reject") {
    if (user.status === "suspended") {
      return new Response(html(`${user.name || user.email} is already suspended.`, "info"), { headers: { "Content-Type": "text/html" } });
    }
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, data.userId));
    return new Response(html(`${user.name || user.email} has been rejected.`, "success"), { headers: { "Content-Type": "text/html" } });
  }

  return new Response(html("Unknown action", "error"), { status: 400, headers: { "Content-Type": "text/html" } });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function html(message: string, type: "success" | "error" | "info") {
  const color = type === "success" ? "#48bb78" : type === "error" ? "#e53e3e" : "#f5c542";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Who's On First — Admin</title></head>
<body style="margin:0;padding:60px 24px;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;text-align:center;">
  <div style="max-width:400px;margin:0 auto;">
    <h1 style="color:#002d62;font-size:20px;">Who's On First</h1>
    <p style="font-size:16px;color:${color};margin:24px 0;">${escapeHtml(message)}</p>
    <a href="/admin" style="color:#002d62;font-size:13px;">Go to Admin Panel</a>
  </div>
</body></html>`;
}
