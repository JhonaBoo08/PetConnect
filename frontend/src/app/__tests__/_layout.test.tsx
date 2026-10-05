import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace, push: jest.fn() };
let mockState = { status: "ready", session: { role: "OWNER" } };
let mockRefreshing = false;

jest.mock("expo-router", () => {
  const React = require("react");
  const View = require("react-native").View;
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  const Stack = Object.assign(Wrapper, {
    Screen: () => null,
    Protected: ({
      guard,
      children,
    }: {
      guard: boolean;
      children: React.ReactNode;
    }) => (guard ? React.createElement(View, null, children) : null),
  });
  return {
    Stack,
    ThemeProvider: Wrapper,
    DarkTheme: {},
    DefaultTheme: {},
    usePathname: () => "/recovery-report",
    useRouter: () => mockRouter,
  };
});
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: async () => undefined,
}));
jest.mock("@/components/animated-icon", () => ({
  AnimatedSplashOverlay: () => null,
}));
jest.mock("@/services/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ state: mockState, refreshing: mockRefreshing }),
}));
jest.mock("@/services/device-recovery", () => ({
  observeNotificationResponses: async () => () => undefined,
  observePushTokenChanges: async () => () => undefined,
}));
import RootLayout from "../_layout";

beforeEach(() => {
  jest.clearAllMocks();
  mockState = { status: "ready", session: { role: "OWNER" } };
  mockRefreshing = false;
});

it("keeps an authenticated owner on the finder evidence route", async () => {
  await render(<RootLayout />);
  expect(mockReplace).not.toHaveBeenCalled();
});

it("keeps the navigator mounted and shows subtle feedback during session refresh", async () => {
  mockRefreshing = true;
  const view = await render(<RootLayout />);
  expect(view.getByText("Syncing")).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

it("redirects a clinic away from owner finder evidence", async () => {
  mockState = { status: "ready", session: { role: "CLINIC" } };
  await render(<RootLayout />);
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith("/clinic-dashboard"),
  );
});
