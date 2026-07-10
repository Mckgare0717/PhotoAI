import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSessionCookie, isAdmin } from "@/lib/auth";

// Auth redirects happen in each protected page (the login page shares this
// layout); this layout only renders the chrome.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAdmin();
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/admin" className="font-semibold">
            PhotoAI · Admin
          </Link>
          {authed && (
            <form action={logout}>
              <button className="text-sm text-neutral-500 hover:text-neutral-900">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}

async function logout() {
  "use server";
  await clearSessionCookie();
  redirect("/admin/login");
}
