import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { Pet } from "../../../../shared/contracts";

const mockPush = jest.fn();
const mockListPets = jest.fn();

jest.mock("expo-image", () => ({ Image: require("react-native").Image }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));
jest.mock("@/components/bottom-nav", () => ({
  BottomNav: () => null,
}));
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "error",
}));
jest.mock("@/services/pets", () => ({
  listPets: (...args: unknown[]) => mockListPets(...args),
  petPhotoUri: (value: string) => value,
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ action: "id" }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    require("react").useEffect(() => callback(), [callback]);
  },
}));

import MyPetsScreen from "../my-pets";

const pet = (id: string, name: string): Pet =>
  ({
    id,
    name,
    species: "Dog",
    breed: "Mixed",
    birthDate: null,
    sex: "Male",
    ageLabel: "2 years",
    identifyingDetails: "",
    photoUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as Pet;

describe("MyPetsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListPets.mockResolvedValue([pet("PET-A", "Bantay"), pet("PET-B", "Luna")]);
  });

  it("shows every owned pet and routes the selected pet ID instead of pets[0]", async () => {
    const view = await render(<MyPetsScreen />);

    await waitFor(() => {
      expect(view.getByText("Bantay")).toBeTruthy();
      expect(view.getByText("Luna")).toBeTruthy();
    });

    fireEvent.press(view.getByLabelText("Open Luna"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/pet-id",
      params: { id: "PET-B" },
    });
  });

  it("shows a useful empty state when the owner has no pets", async () => {
    mockListPets.mockResolvedValue([]);
    const view = await render(<MyPetsScreen />);

    await waitFor(() =>
      expect(view.getByText("No pets linked yet")).toBeTruthy(),
    );
    fireEvent.press(view.getByText("Add your first pet"));
    expect(mockPush).toHaveBeenCalledWith("/add-pet");
  });
});
