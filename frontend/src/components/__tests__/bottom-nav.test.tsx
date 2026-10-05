import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockNavigate = jest.fn();
const mockSelection = jest.fn(async () => undefined);
let mockFocus: (() => void) | undefined;

jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  useFocusEffect: (onFocus: () => void) => {
    mockFocus = onFocus;
  },
}));

jest.mock("expo-haptics", () => ({
  selectionAsync: () => mockSelection(),
}));

import { BottomNav } from "../bottom-nav";

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus = undefined;
});

it("does not rebuild the active tab when it is pressed again", async () => {
  const view = await render(<BottomNav active="home" />);
  await fireEvent.press(view.getByRole("tab", { name: "Home" }));
  expect(mockNavigate).not.toHaveBeenCalled();
});

it("shows immediate navigation feedback while opening another tab", async () => {
  const view = await render(<BottomNav active="home" />);
  await fireEvent.press(view.getByRole("tab", { name: "Pets" }));

  expect(view.getByText("Opening…")).toBeTruthy();
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/my-pets"));
});

it("enables navigation when returning to a previously mounted root", async () => {
  const view = await render(<BottomNav active="home" />);
  await fireEvent.press(view.getByRole("tab", { name: "Pets" }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/my-pets"));

  await act(async () => {
    mockFocus?.();
  });

  expect(view.queryByText("Opening…")).toBeNull();
  expect(view.getByRole("tab", { name: "Recovery" })).toBeEnabled();
  await fireEvent.press(view.getByRole("tab", { name: "Recovery" }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/alerts"));
});
