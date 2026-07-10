import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import EventDashboard from "./EventDashboard";

export default async function AdminHome() {
  if (!(await isAdmin())) redirect("/admin/login");
  return <EventDashboard />;
}
