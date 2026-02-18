import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournamentResults, tournaments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const golferIdStr = request.nextUrl.searchParams.get("golferId");
  if (!golferIdStr) {
    return NextResponse.json(
      { error: "golferId is required" },
      { status: 400 }
    );
  }

  const golferId = parseInt(golferIdStr);
  if (isNaN(golferId)) {
    return NextResponse.json(
      { error: "golferId must be a number" },
      { status: 400 }
    );
  }

  try {
    const results = await db
      .select({
        tournamentName: tournaments.name,
        startDate: tournaments.startDate,
        position: tournamentResults.position,
        totalScoreToPar: tournamentResults.totalScoreToPar,
        earnings: tournamentResults.earnings,
        madeCut: tournamentResults.madeCut,
        isWithdrawn: tournamentResults.isWithdrawn,
      })
      .from(tournamentResults)
      .innerJoin(tournaments, eq(tournamentResults.tournamentId, tournaments.id))
      .where(eq(tournamentResults.golferId, golferId))
      .orderBy(desc(tournaments.startDate))
      .limit(15);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch golfer results" },
      { status: 500 }
    );
  }
}
