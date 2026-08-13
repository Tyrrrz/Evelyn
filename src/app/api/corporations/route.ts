import { NextRequest, NextResponse } from "next/server";
import { searchCorporations } from "@/lib/esi";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "";
  if (!query.trim()) {
    return NextResponse.json([]);
  }
  try {
    const corps = await searchCorporations(query);
    return NextResponse.json(corps);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to search corporations" }, { status: 500 });
  }
}
