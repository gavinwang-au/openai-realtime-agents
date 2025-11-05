import { NextRequest, NextResponse } from "next/server";
import { verifyAuthorizationHeader } from "../../lib/openauth";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const verified = await verifyAuthorizationHeader(authorization);

  if ("err" in verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    userId: verified.subject.properties.id,
  });
}
