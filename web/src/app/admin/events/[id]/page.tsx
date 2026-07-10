import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import EventDetail from "./EventDetail";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  return <EventDetail eventId={id} />;
}
