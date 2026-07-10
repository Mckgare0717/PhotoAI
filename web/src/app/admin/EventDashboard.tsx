"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface EventRow {
  id: string;
  name: string;
  event_date: string | null;
  slug: string;
  photo_count: number;
  processing_count: number;
  face_count: number;
  expires_at: string;
  created_at: string;
}

export default function EventDashboard() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/events");
    if (res.ok) {
      const body = await res.json();
      setEvents(body.events);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, eventDate: date || undefined }),
    });
    if (res.ok) {
      setName("");
      setDate("");
      setShowForm(false);
      load();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create event");
    }
  }

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          {showForm ? "Cancel" : "New event"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={createEvent}
          className="mb-8 flex flex-wrap items-end gap-4 rounded-xl border border-neutral-200 bg-white p-4"
        >
          <label className="flex flex-col gap-1 text-sm">
            Event name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="Sarah & Tom's Wedding"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2"
            />
          </label>
          <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700">
            Create
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-neutral-500">No events yet — create your first one.</p>
      ) : (
        <ul className="grid gap-3">
          {events.map((ev) => (
            <li key={ev.id}>
              <Link
                href={`/admin/events/${ev.id}`}
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-400"
              >
                <div>
                  <p className="font-medium">{ev.name}</p>
                  <p className="text-sm text-neutral-500">
                    {ev.event_date ? new Date(ev.event_date).toLocaleDateString() : "No date"} ·
                    expires {new Date(ev.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right text-sm text-neutral-600">
                  <p>
                    {ev.photo_count} photos · {ev.face_count} faces indexed
                  </p>
                  {ev.processing_count > 0 && (
                    <p className="text-amber-600">{ev.processing_count} processing…</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
