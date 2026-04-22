import { NextRequest, NextResponse } from "next/server";
import { getUser, getActiveTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { teams } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTeam = await getActiveTeam(request);
  const allTeams = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.userId, user.id))
    .orderBy(teams.createdAt);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      teamName: activeTeam?.name ?? null,
      activeTeamId: activeTeam?.id ?? null,
    },
    teams: allTeams,
  });
}
