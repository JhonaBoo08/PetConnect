import type { Href } from "expo-router";
import type { UserRole } from "../../../shared/contracts";

export function notificationTarget(data: Record<string, unknown>, role: UserRole): Href {
  const id = (key: string) =>
    typeof data[key] === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(data[key] as string)
      ? (data[key] as string) : "";
  if (role === "CLINIC") {
    return id("appointmentId")
      ? { pathname: "/clinic-dashboard", params: { appointmentId: id("appointmentId") } }
      : "/clinic-dashboard";
  }
  if (id("reminderId")) return { pathname: "/reminder-details", params: { id: id("reminderId") } };
  if (id("appointmentId") || id("healthRecordId"))
    return { pathname: "/health-reminders", params: id("petId") ? { petId: id("petId") } : {} };
  if ((data.type === "PET_SIGHTED" || data.type === "PET_FOUND") && id("reportId") && id("sightingId"))
    return { pathname: "/recovery-report", params: { reportId: id("reportId"), sightingId: id("sightingId") } };
  if (data.type === "PET_QR_FOUND" && id("recoveryContactEventId"))
    return { pathname: "/recovery-report", params: { eventId: id("recoveryContactEventId") } };
  if (data.type === "LOST_PET_NEARBY")
    return { pathname: "/alerts", params: { mode: "feed" } };
  if (id("reportId"))
    return { pathname: "/alerts", params: { mode: "report", reportId: id("reportId") } };
  return "/notifications";
}
