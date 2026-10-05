import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PrivacySettings } from "../../../../shared/contracts";

const mockGetPrivacySettings = jest.fn();
const mockUpdatePrivacySettings = jest.fn();

jest.mock("@/services/auth", () => ({
  getPrivacySettings: (...args: unknown[]) => mockGetPrivacySettings(...args),
  updatePrivacySettings: (...args: unknown[]) =>
    mockUpdatePrivacySettings(...args),
}));

jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "error",
}));

jest.mock("@/lib/navigation", () => ({
  goBack: jest.fn(),
}));

jest.mock("expo-router", () => {
  const ReactModule = require("react");
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactModule.useEffect(() => callback(), []);
    },
  };
});

import PrivacySettingsScreen from "../privacy-settings";

describe("PrivacySettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrivacySettings.mockResolvedValue({
      shareRecoveryPhone: false,
      sharePreciseRecoveryLocation: false,
      sharePhoneWithClinics: true,
    });
    mockUpdatePrivacySettings.mockImplementation(
      async (patch: Partial<PrivacySettings>) => ({
        shareRecoveryPhone: false,
        sharePreciseRecoveryLocation: false,
        sharePhoneWithClinics: true,
        ...patch,
      }),
    );
  });

  it("renders privacy-safe defaults and persists an opt-in", async () => {
    const view = await render(<PrivacySettingsScreen />);

    await waitFor(() =>
      expect(view.getByText("Show recovery phone")).toBeTruthy(),
    );

    const phoneSwitch = view.getByLabelText("Show recovery phone");
    expect(phoneSwitch.props.value).toBe(false);

    await act(async () => {
      fireEvent(phoneSwitch, "valueChange", true);
    });

    await waitFor(() =>
      expect(mockUpdatePrivacySettings).toHaveBeenCalledWith({
        shareRecoveryPhone: true,
      }),
    );
  });
});
