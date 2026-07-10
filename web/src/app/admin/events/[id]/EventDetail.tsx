"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface PhotoRow {
  id: string;
  original_filename: string;
  status: "queued" | "processing" | "ready" | "failed";
  error: string | null;
  face_count: number;
  thumbnail_url: string | null;
  uploaded_at: string;
}

interface EventData {
  event: {
    id: string;
    name: string;
    slug: string;
    similarity_threshold: number;
    retention_days: number;
    expires_at: string;
    lawful_basis: string | null;
  };
  guestUrl: string;
  qrDataUrl: string;
  searchCount: number;
  photos: PhotoRow[];
}

const UPLOAD_BATCH_SIZE = 5;

export default function EventDetail({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [data, setData] = useState<EventData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/events/${eventId}`);
    if (res.ok) setData(await res.json());
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any photo is still being indexed.
  const hasPending = data?.photos.some((p) => p.status === "queued" || p.status === "processing");
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [hasPending, load]);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i += UPLOAD_BATCH_SIZE) {
      const batch = files.slice(i, i + UPLOAD_BATCH_SIZE);
      const form = new FormData();
      for (const f of batch) form.append("photos", f);
      await fetch(`/api/admin/events/${eventId}/photos`, { method: "POST", body: form });
      setProgress({ done: Math.min(i + UPLOAD_BATCH_SIZE, files.length), total: files.length });
      load();
    }
    setUploading(false);
    load();
  }

  async function deletePhoto(photoId: string) {
    await fetch(`/api/admin/photos/${photoId}`, { method: "DELETE" });
    load();
  }

  async function updateSetting(patch: Record<string, unknown>) {
    await fetch(`/api/admin/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  }

  async function deleteEvent() {
    if (!confirm("Delete this event and ALL its photos and face data? This cannot be undone.")) return;
    await fetch(`/api/admin/events/${eventId}`, { method: "DELETE" });
    router.push("/admin");
  }

  if (!data) return <p className="text-neutral-500">Loading…</p>;
  const { event, photos } = data;
  const ready = photos.filter((p) => p.status === "ready").length;
  const failed = photos.filter((p) => p.status === "failed").length;
  const facesIndexed = photos.reduce((sum, p) => sum + p.face_count, 0);

  return (
    <main className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="text-sm text-neutral-500">
            {photos.length} photos · {ready} indexed · {facesIndexed} faces ·{" "}
            {data.searchCount} guest searches
            {failed > 0 && <span className="text-red-600"> · {failed} failed</span>}
          </p>
        </div>
        <button onClick={deleteEvent} className="text-sm text-red-600 hover:underline">
          Delete event
        </button>
      </div>

      <section className="grid gap-6 rounded-xl border border-neutral-200 bg-white p-5 sm:grid-cols-[auto_1fr]">
        <img src={data.qrDataUrl} alt="Event QR code" className="h-40 w-40" />
        <div className="grid content-start gap-2 text-sm">
          <p className="font-medium">Guest link</p>
          <a href={data.guestUrl} className="break-all text-blue-600 underline" target="_blank">
            {data.guestUrl}
          </a>
          <p className="text-neutral-500">
            Share this link or QR code with guests. They take a selfie and instantly get every
            photo they appear in. Expires {new Date(event.expires_at).toLocaleDateString()}.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              Match threshold
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="0.95"
                defaultValue={event.similarity_threshold}
                onBlur={(e) => updateSetting({ similarityThreshold: Number(e.target.value) })}
                className="w-20 rounded border border-neutral-300 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2">
              Retention (days)
              <input
                type="number"
                min="1"
                max="365"
                defaultValue={event.retention_days}
                onBlur={(e) => updateSetting({ retentionDays: Number(e.target.value) })}
                className="w-20 rounded border border-neutral-300 px-2 py-1"
              />
            </label>
          </div>
          <label className="mt-1 grid gap-1">
            <span>Lawful basis for processing (shown to guests)</span>
            <input
              defaultValue={event.lawful_basis ?? ""}
              placeholder="e.g. Explicit consent collected at event sign-in"
              onBlur={(e) => updateSetting({ lawfulBasis: e.target.value })}
              className="rounded border border-neutral-300 px-2 py-1"
            />
          </label>
        </div>
      </section>

      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          uploadFiles(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragOver ? "border-neutral-900 bg-neutral-100" : "border-neutral-300 bg-white"
        }`}
      >
        <p className="mb-3 text-neutral-600">Drag &amp; drop photos here, or</p>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          Choose files
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            uploadFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        {uploading && (
          <div className="mx-auto mt-4 max-w-sm">
            <div className="h-2 overflow-hidden rounded bg-neutral-200">
              <div
                className="h-full bg-neutral-900 transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              Uploading {progress.done}/{progress.total}…
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Photos</h2>
        {photos.length === 0 ? (
          <p className="text-neutral-500">No photos uploaded yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((p) => (
              <li key={p.id} className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-white">
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt={p.original_filename} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-xs text-neutral-400">
                    {p.status === "failed" ? "failed" : "processing…"}
                  </div>
                )}
                <div className="flex items-center justify-between px-2 py-1 text-xs">
                  <span
                    className={
                      p.status === "ready"
                        ? "text-green-700"
                        : p.status === "failed"
                          ? "text-red-600"
                          : "text-amber-600"
                    }
                    title={p.error ?? undefined}
                  >
                    {p.status === "ready" ? `${p.face_count} face${p.face_count === 1 ? "" : "s"}` : p.status}
                  </span>
                  <button
                    onClick={() => deletePhoto(p.id)}
                    className="text-neutral-400 hover:text-red-600"
                    title="Delete photo"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
