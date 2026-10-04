import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export interface SessionData {
  userId?: number;
}

const password = process.env.SESSION_SECRET;
if (!password || password.length < 32) {
  throw new Error(
    "SESSION_SECRET must be set and at least 32 characters long",
  );
}

export const sessionOptions: SessionOptions = {
  cookieName: "assessment_practice_session",
  password,
  ttl: 60 * 60 * 24 * 14, // 14 days — this is a personal, single-user tool
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
};

/** For use in Server Components, Server Actions, and Route Handlers. */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/** Throws-free helper: returns the logged-in user id, or null. */
export async function getUserId(): Promise<number | null> {
  const session = await getSession();
  return session.userId ?? null;
}
