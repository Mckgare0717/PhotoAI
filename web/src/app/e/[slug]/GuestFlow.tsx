"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";

type Step = "loading" | "error" | "consent" | "capture" | "searching" | "results";

interface MatchResult {
  photoId: string;
  filename: string;
  similarity: number;
  thumbnailUrl: string | null;
  webUrl: string | null;
  downloadUrl: string;
}

export default function GuestFlow({ slug }: { slug: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [eventName, setEventName] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<MatchResult | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch(`/api/guest/${slug}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Event not found");
        setEventName(body.event.name);
        setStep("consent");
      })
      .catch((err) => {
        setError(err.message);
        setStep("error");
      });
  }, [slug]);

  const search = useCallback(
    async (selfie: Blob) => {
      setStep("searching");
      setError("");
      const form = new FormData();
      form.append("selfie", selfie, "selfie.jpg");
      form.append("consent", "true");
      const res = await fetch(`/api/guest/${slug}/search`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Search failed — please try again.");
        setStep("capture");
        return;
      }
      setResults(body.results);
      setSelected(new Set(body.results.map((r: MatchResult) => r.photoId)));
      setStep("results");
    },
    [slug]
  );

  const requestDeletion = useCallback(
    async (selfie: Blob) => {
      const form = new FormData();
      form.append("selfie", selfie, "selfie.jpg");
      const res = await fetch(`/api/guest/${slug}/delete-my-data`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotice(
          `Done — ${body.deletedFaceCount} stored face record${body.deletedFaceCount === 1 ? "" : "s"} matching your selfie ${body.deletedFaceCount === 1 ? "was" : "were"} permanently deleted. You will no longer appear in face-search results for this event.`
        );
      } else {
        setNotice(body.error ?? "Deletion request failed.");
      }
    },
    [slug]
  );

  if (step === "loading") {
    return <Shell title="">Loading…</Shell>;
  }
  if (step === "error") {
    return (
      <Shell title="Oops">
        <p className="text-red-600">{error}</p>
      </Shell>
    );
  }
  if (step === "consent") {
    return <ConsentScreen eventName={eventName} onAgree={() => setStep("capture")} />;
  }
  if (step === "capture" || step === "searching") {
    return (
      <Shell title={eventName}>
        <SelfieCapture onCapture={search} busy={step === "searching"} error={error} />
      </Shell>
    );
  }

  return (
    <ResultsGallery
      slug={slug}
      eventName={eventName}
      results={results}
      selected={selected}
      setSelected={setSelected}
      lightbox={lightbox}
      setLightbox={setLightbox}
      onSearchAgain={() => {
        setNotice("");
        setStep("capture");
      }}
      onRequestDeletion={requestDeletion}
      notice={notice}
    />
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col p-6">
      {title && <h1 className="mb-6 text-center text-2xl font-bold">{title}</h1>}
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </main>
  );
}

function ConsentScreen({ eventName, onAgree }: { eventName: string; onAgree: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <Shell title={eventName}>
      <div className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Find your photos with a selfie</h2>
        <div className="grid gap-3 text-sm text-neutral-700">
          <p>To find photos you appear in, we need to briefly process a selfie. Here is exactly what happens:</p>
          <ul className="grid list-disc gap-1.5 pl-5">
            <li>
              Your selfie is converted into a numeric face signature and compared against faces in
              this event&apos;s photos — <strong>this happens once, in memory</strong>.
            </li>
            <li>
              Your selfie and its face signature are <strong>never stored</strong> — both are
              discarded as soon as your search finishes.
            </li>
            <li>Your face data is not used for anything else: no other events, no training, no third parties.</li>
            <li>We keep an anonymous log of the search (time and number of matches only).</li>
            <li>
              You can ask for your face data from this event&apos;s photos to be deleted at any time
              using the &ldquo;Delete my face data&rdquo; option on the results page.
            </li>
          </ul>
          <p className="text-neutral-500">
            Face data is biometric data under UK GDPR. We process it only with your explicit
            consent, solely to run this one search.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5"
          />
          I consent to my selfie being processed once, in memory, to find my photos from this event.
        </label>
        <button
          onClick={onAgree}
          disabled={!checked}
          className="rounded-lg bg-neutral-900 px-4 py-2.5 text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </Shell>
  );
}

function SelfieCapture({
  onCapture,
  busy,
  error,
}: {
  onCapture: (blob: Blob) => void;
  busy: boolean;
  error: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError("Camera unavailable — you can upload a photo instead.");
    }
  }

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          stopCamera();
          onCapture(blob);
        }
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Take a selfie</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {busy ? (
        <div className="grid place-items-center gap-3 py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          <p className="text-sm text-neutral-500">Searching for your photos…</p>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full rounded-lg bg-neutral-100 ${cameraOn ? "" : "hidden"}`}
          />
          {cameraOn ? (
            <button
              onClick={snap}
              className="rounded-lg bg-neutral-900 px-4 py-2.5 text-white hover:bg-neutral-700"
            >
              Take photo &amp; search
            </button>
          ) : (
            <button
              onClick={startCamera}
              className="rounded-lg bg-neutral-900 px-4 py-2.5 text-white hover:bg-neutral-700"
            >
              Open camera
            </button>
          )}
          {cameraError && <p className="text-sm text-amber-600">{cameraError}</p>}
          <div className="text-center text-sm text-neutral-400">or</div>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 hover:border-neutral-900"
          >
            Upload a photo of yourself
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                stopCamera();
                onCapture(file);
              }
              e.target.value = "";
            }}
          />
          <p className="text-xs text-neutral-400">
            Your selfie is used once for this search and never stored.
          </p>
        </>
      )}
    </div>
  );
}

function parseSignedUrl(url: string): { path: string; exp: number; sig: string } | null {
  try {
    const u = new URL(url, window.location.origin);
    const path = decodeURIComponent(u.pathname.replace(/^\/api\/files\//, ""));
    return { path, exp: Number(u.searchParams.get("exp")), sig: u.searchParams.get("sig") ?? "" };
  } catch {
    return null;
  }
}

function ResultsGallery({
  slug,
  eventName,
  results,
  selected,
  setSelected,
  lightbox,
  setLightbox,
  onSearchAgain,
  onRequestDeletion,
  notice,
}: {
  slug: string;
  eventName: string;
  results: MatchResult[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  lightbox: MatchResult | null;
  setLightbox: (m: MatchResult | null) => void;
  onSearchAgain: () => void;
  onRequestDeletion: (selfie: Blob) => Promise<void>;
  notice: string;
}) {
  const [zipping, setZipping] = useState(false);
  const deleteFileRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function downloadZip() {
    const items = results
      .filter((r) => selected.has(r.photoId))
      .map((r) => parseSignedUrl(r.downloadUrl))
      .filter(Boolean);
    if (items.length === 0) return;
    setZipping(true);
    try {
      const res = await fetch(`/api/guest/${slug}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${eventName || "photos"}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setZipping(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">{eventName}</h1>
      <p className="mb-4 text-neutral-600">
        {results.length === 0
          ? "No photos matched your selfie. Try again with better lighting, facing the camera."
          : `We found ${results.length} photo${results.length === 1 ? "" : "s"} of you.`}
      </p>

      {notice && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button onClick={onSearchAgain} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-900">
          Search again
        </button>
        {results.length > 0 && (
          <>
            <button
              onClick={() =>
                setSelected(
                  selected.size === results.length
                    ? new Set()
                    : new Set(results.map((r) => r.photoId))
                )
              }
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-900"
            >
              {selected.size === results.length ? "Deselect all" : "Select all"}
            </button>
            <button
              onClick={downloadZip}
              disabled={selected.size === 0 || zipping}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {zipping ? "Preparing zip…" : `Download ${selected.size} selected`}
            </button>
          </>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {results.map((r) => (
          <li key={r.photoId} className="relative overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <button onClick={() => setLightbox(r)} className="block w-full">
              {r.thumbnailUrl && (
                <img src={r.thumbnailUrl} alt="" className="aspect-square w-full object-cover" />
              )}
            </button>
            <label className="absolute left-2 top-2 rounded bg-white/80 p-1">
              <input
                type="checkbox"
                checked={selected.has(r.photoId)}
                onChange={() => toggle(r.photoId)}
              />
            </label>
            <a
              href={`${r.downloadUrl}&download=1`}
              className="absolute bottom-2 right-2 rounded bg-white/80 px-2 py-1 text-xs hover:bg-white"
            >
              ↓
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-10 border-t border-neutral-200 pt-4 text-sm text-neutral-500">
        <p>
          Want your face removed from this event&apos;s search index?{" "}
          <button
            onClick={() => deleteFileRef.current?.click()}
            disabled={deleting}
            className="text-red-600 underline disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete my face data"}
          </button>{" "}
          (you&apos;ll be asked for a selfie to identify which face records are yours; it is
          discarded immediately after).
        </p>
        <input
          ref={deleteFileRef}
          type="file"
          accept="image/*"
          capture="user"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              setDeleting(true);
              await onRequestDeletion(file);
              setDeleting(false);
            }
            e.target.value = "";
          }}
        />
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.webUrl ?? lightbox.thumbnailUrl ?? ""}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </main>
  );
}
