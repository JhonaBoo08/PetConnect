import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockLaunchImageLibraryAsync = jest.fn();
const mockGetPendingResultAsync = jest.fn();
const mockManipulate = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-image", () => ({ Image: require("react-native").Image }));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (...args: unknown[]) =>
    mockLaunchImageLibraryAsync(...args),
  getPendingResultAsync: (...args: unknown[]) =>
    mockGetPendingResultAsync(...args),
}));
jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: {
    manipulate: (...args: unknown[]) => mockManipulate(...args),
  },
  SaveFormat: { JPEG: "jpeg" },
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/lib/navigation", () => ({ goBack: jest.fn() }));
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Unable to choose photo.",
}));
jest.mock("@/services/pets", () => ({
  createPet: jest.fn(),
  getPet: jest.fn(),
  petPhotoUri: (value: string) => value,
  removePetPhoto: jest.fn(),
  updatePet: jest.fn(),
  uploadPetPhoto: jest.fn(),
}));

import AddPetScreen from "../add-pet";

describe("AddPetScreen photo picker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPendingResultAsync.mockResolvedValue(null);
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///picked-pet.jpg",
          width: 1600,
          height: 1200,
        },
      ],
    });
  });

  it("keeps and confirms the selected photo when optimization fails", async () => {
    mockManipulate.mockImplementation(() => {
      throw new Error("native optimizer unavailable");
    });

    const view = await render(<AddPetScreen />);
    await act(async () => {
      fireEvent.press(view.getByText("Add pet photo"));
    });

    await waitFor(() => {
      expect(view.getByText("Selected pet photo")).toBeTruthy();
      expect(
        view.getByText(
          "Photo selected. PetConnect could not optimize it, so the original will be used.",
        ),
      ).toBeTruthy();
    });
  });

  it("shows success feedback after the selected photo is optimized", async () => {
    mockManipulate.mockReturnValue({
      resize: jest.fn(),
      renderAsync: jest.fn().mockResolvedValue({
        saveAsync: jest.fn().mockResolvedValue({
          uri: "file:///optimized-pet.jpg",
        }),
      }),
    });

    const view = await render(<AddPetScreen />);
    await act(async () => {
      fireEvent.press(view.getByText("Add pet photo"));
    });

    await waitFor(() => expect(view.getByText("Photo ready.")).toBeTruthy());
    expect(view.getByText("Selected pet photo")).toBeTruthy();
  });

  it("recovers a completed Android picker result after the activity is recreated", async () => {
    mockGetPendingResultAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///recovered-pet.jpg",
          width: 800,
          height: 600,
        },
      ],
    });
    mockManipulate.mockReturnValue({
      resize: jest.fn(),
      renderAsync: jest.fn().mockResolvedValue({
        saveAsync: jest.fn().mockResolvedValue({
          uri: "file:///recovered-pet-optimized.jpg",
        }),
      }),
    });

    const view = await render(<AddPetScreen />);

    await waitFor(() => expect(view.getByText("Photo ready.")).toBeTruthy());
    expect(view.getByText("Selected pet photo")).toBeTruthy();
  });
});
