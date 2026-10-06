import { expect, it, jest } from "@jest/globals";
const mockFetch = jest.fn();
jest.mock("../auth", () => ({
  authenticatedFetch: (...args: unknown[]) => mockFetch(...args),
}));
import { getHealthReminder } from "../health-clinic";
it("loads a reminder directly by its encoded ID without the capped collection", async () => {
  mockFetch.mockResolvedValue({ id: "RM-259" });
  await expect(getHealthReminder("RM-259")).resolves.toEqual({ id: "RM-259" });
  expect(mockFetch).toHaveBeenCalledWith("/v1/reminders/RM-259");
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
