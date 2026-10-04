import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession, nextProxyCookies } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return response;
  }

  const session = await getIronSession<SessionData>(
    nextProxyCookies(request, response),
    sessionOptions,
  );

  if (!session.userId) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/login).*)",
  ],
};
