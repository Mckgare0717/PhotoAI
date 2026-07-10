import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">PhotoAI</h1>
      <p className="text-neutral-600">
        Event photography with private face search. Guests scan a QR code, take a selfie, and
        instantly find every photo they appear in.
      </p>
      <div className="flex gap-4">
        <Link
          href="/admin"
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-white hover:bg-neutral-700"
        >
          Photographer portal
        </Link>
      </div>
      <p className="text-sm text-neutral-400">
        Guests: use the event link or QR code your photographer shared with you.
      </p>
    </main>
  );
}
