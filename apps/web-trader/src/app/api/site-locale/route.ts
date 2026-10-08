import { NextRequest, NextResponse } from "next/server";
import { siteLanguageFromHints } from "@/lib/site-language";

export function GET(request: NextRequest) {
  const suggestion = siteLanguageFromHints(
    request.headers.get("x-vercel-ip-country"),
    request.headers.get("accept-language"),
  );

  return NextResponse.json(suggestion, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
