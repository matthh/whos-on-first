import { NextRequest, NextResponse } from "next/server";
import { getUserId, getUser, getActiveTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosters, teams, users } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const team = await getActiveTeam(request);
  if (!team) {
    // User has no team yet (pre-onboarding). Return empty shell.
    return NextResponse.json({ players: [], config: null });
  }

  const [roster] = await db
    .select()
    .from(rosters)
    .where(and(eq(rosters.userId, userId), eq(rosters.teamId, team.id)))
    .limit(1);

  return NextResponse.json({
    players: roster?.players || [],
    config: team.constraintConfig || null,
  });
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

export async function PUT(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const body = await request.json();
  const { players, config, coachName } = body;

  if (players !== undefined) {
    if (!Array.isArray(players) || players.length > 20) {
      return NextResponse.json({ error: "Invalid players: must be an array with max 20 items" }, { status: 400 });
    }
    for (const p of players) {
      if (typeof p.id !== "string" || typeof p.name !== "string" || typeof p.rank !== "number" || typeof p.absent !== "boolean") {
        return NextResponse.json({ error: "Invalid player: each must have id (string), name (string), rank (number), absent (boolean)" }, { status: 400 });
      }
      if (p.recognized !== undefined && typeof p.recognized !== "boolean") {
        p.recognized = false;
      }
      if (p.name.length > 50) {
        return NextResponse.json({ error: "Player name must be 50 characters or less" }, { status: 400 });
      }
      p.name = stripHtml(p.name);
    }
  }

  if (config !== undefined && (typeof config !== "object" || config === null || Array.isArray(config))) {
    return NextResponse.json({ error: "Invalid config: must be an object" }, { status: 400 });
  }

  // Resolve active team, or create one lazily on first write during onboarding.
  let team = await getActiveTeam(request);
  if (!team) {
    const desiredName =
      (config && typeof config === "object" && typeof config.teamName === "string" && config.teamName.trim()) ||
      "My Team";
    const [created] = await db
      .insert(teams)
      .values({
        userId,
        name: desiredName,
        logoDataUrl: config?.logoDataUrl ?? null,
        constraintConfig: config ?? null,
      })
      .returning();
    await db.update(users).set({ activeTeamId: created.id }).where(eq(users.id, userId));
    team = created;
  }

  // Upsert roster for this team
  if (players !== undefined) {
    const [existing] = await db
      .select()
      .from(rosters)
      .where(and(eq(rosters.userId, userId), eq(rosters.teamId, team.id)))
      .limit(1);
    if (existing) {
      await db.update(rosters).set({ players, updatedAt: new Date() }).where(eq(rosters.id, existing.id));
    } else {
      await db.insert(rosters).values({ userId, teamId: team.id, players });
    }
  }

  // Update team metadata (name, logo, constraint config)
  const teamUpdates: Record<string, unknown> = {};
  if (config !== undefined) {
    teamUpdates.constraintConfig = config;
    if (typeof config?.teamName === "string" && config.teamName.trim()) {
      teamUpdates.name = config.teamName.trim();
    }
    if (config?.logoDataUrl !== undefined) {
      teamUpdates.logoDataUrl = config.logoDataUrl;
    }
  }
  if (Object.keys(teamUpdates).length > 0) {
    await db.update(teams).set(teamUpdates).where(eq(teams.id, team.id));
  }

  // Coach name is a user-level field, not team-level
  if (coachName !== undefined) {
    await db.update(users).set({ name: coachName }).where(eq(users.id, userId));
  }

  return NextResponse.json({ ok: true });
}
