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
  expect(notificationTarget(data, "OWNER")).toEqual(target);
});
it("keeps a clinic appointment inside the clinic queue", () => {
  expect(
    notificationTarget(
      { appointmentId: "AP-LUNA", petId: "PET-LUNA" },
      "CLINIC",
    ),
  ).toEqual({
    pathname: "/clinic-dashboard",
    params: { appointmentId: "AP-LUNA" },
  });
});
it("ignores arbitrary URLs and malformed IDs", () => {
  expect(
    notificationTarget(
      { url: "https://outside.example.test", reminderId: {} },
      "OWNER",
    ),
  ).toBe("/notifications");
  expect(notificationTarget({ reminderId: "RM-LUNA" }, "CLINIC")).toBe(
    "/clinic-dashboard",
  );
});
