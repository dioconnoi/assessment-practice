import Link from "next/link";
import { getUserId } from "@/lib/auth/session";
import LogoutButton from "./LogoutButton";

export default async function NavBar() {
  const userId = await getUserId();
  if (!userId) return null;

  return (
    <nav className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
      <Link href="/" className="font-semibold">
        Assessment Practice
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/" className="hover:underline">
          Practice
        </Link>
        <Link href="/progress" className="hover:underline">
          Progress
        </Link>
        <LogoutButton />
      </div>
    </nav>
  );
}
