import { expect, it } from "@jest/globals";
import { notificationTarget } from "../notification-target";

it.each([
  [
    { reminderId: "RM-LUNA" },
    { pathname: "/reminder-details", params: { id: "RM-LUNA" } },
  ],
  [
    { appointmentId: "AP-LUNA", petId: "PET-LUNA" },
    { pathname: "/health-reminders", params: { petId: "PET-LUNA" } },
  ],
  [
    { reportId: "LR-BANTAY", type: "PET_SIGHTED" },
    { pathname: "/alerts", params: { mode: "report", reportId: "LR-BANTAY" } },
  ],
  [
    { reportId: "LR-NEARBY", type: "LOST_PET_NEARBY" },
    { pathname: "/alerts", params: { mode: "feed" } },
  ],
])("routes owner push data %j to its protected target", (data, target) => {
  expect(notificationTarget(data)).toEqual(target);
});
it("ignores arbitrary URLs and malformed IDs", () => {
  expect(
    notificationTarget({ url: "https://outside.example.test", reminderId: {} }),
  ).toBe("/notifications");
});

it.each([
  [
    { type: "PET_SIGHTED", reportId: "LR-MILO", sightingId: "SG-MILO" },
    {
      pathname: "/recovery-report",
      params: { reportId: "LR-MILO", sightingId: "SG-MILO" },
    },
  ],
  [
    { type: "PET_FOUND", reportId: "LR-MILO", sightingId: "SG-FOUND" },
    {
      pathname: "/recovery-report",
      params: { reportId: "LR-MILO", sightingId: "SG-FOUND" },
    },
  ],
  [
    { type: "PET_QR_FOUND", recoveryContactEventId: "RC-MILO" },
    { pathname: "/recovery-report", params: { eventId: "RC-MILO" } },
  ],
])("opens evidence from owner push data %j", (data, target) => {
  expect(notificationTarget(data)).toEqual(target);
});
