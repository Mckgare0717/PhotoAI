import { NextResponse } from "next/server";
import { checkPassword, setSessionCookie } from "@/lib/auth";
import { requireSecrets } from "@/lib/config";

export async function POST(req: Request) {
  requireSecrets();
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  await setSessionCookie();
  return NextResponse.json({ ok: true });
}
