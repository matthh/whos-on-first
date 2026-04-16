import { NextRequest, NextResponse } from "next/server";
import { getUserId, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { sendApprovalNotification, sendInviteEmail, sendPendingSignupEmail } from "@/lib/email";

async function countOtherAdmins(targetId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), ne(users.id, targetId)));
  return Number(row?.count ?? 0);
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allUsers = await db.select().from(users);
  return NextResponse.json({ users: allUsers });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { email, name, role, status } = body;

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  try {
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        name: name || null,
        role: role || "user",
        status: status || "approved",
      })
      .returning();

    // Send appropriate email
    if ((status || "approved") === "approved") {
      await sendInviteEmail(email.toLowerCase().trim());
    } else if (status === "pending") {
      sendPendingSignupEmail(email.toLowerCase().trim(), name || null).catch(err =>
        console.error("[ADMIN] Failed to send pending email:", err)
      );
    }

    return NextResponse.json({ user }, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { id, name, email, role, status } = body;

  if (!id) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  // Get current user state before update
  const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const currentAdminId = getUserId(request);

  // Prevent an admin from demoting themselves — admins must use another admin
  // account to change their own role.
  if (role !== undefined && role !== current.role && currentAdminId === id) {
    return NextResponse.json(
      { error: "Cannot change your own role" },
      { status: 400 }
    );
  }

  // Guard against demoting the last admin (role: admin -> user).
  if (role !== undefined && current.role === "admin" && role !== "admin") {
    const others = await countOtherAdmins(id);
    if (others === 0) {
      return NextResponse.json(
        { error: "Cannot remove last admin" },
        { status: 400 }
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email.toLowerCase().trim();
  if (role !== undefined) updates.role = role;
  if (status !== undefined) updates.status = status;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning();

  // Send approval notification if status changed to approved
  if (status === "approved" && current.status !== "approved") {
    await sendApprovalNotification(updated.email, updated.name);
  }

  return NextResponse.json({ user: updated });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get("id") || "", 10);
  if (!id) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const currentAdminId = getUserId(request);
  if (currentAdminId === id) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 }
    );
  }

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "admin") {
    const others = await countOtherAdmins(id);
    if (others === 0) {
      return NextResponse.json(
        { error: "Cannot remove last admin" },
        { status: 400 }
      );
    }
  }

  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
