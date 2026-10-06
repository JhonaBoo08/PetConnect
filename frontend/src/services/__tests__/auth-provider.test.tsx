import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, it, jest } from "@jest/globals";
import type { SessionResponse } from "../../../../shared/contracts";
const mockAuth: { currentUser: { uid: string; email: string } | null } = {
  currentUser: null,
};
let mockListener: (user: unknown) => void = () => {};
let mockSignOut: () => Promise<void> = async () => {};
const mockCurrentSession = jest.fn<() => Promise<SessionResponse>>();
const mockLoader = jest.fn<() => Promise<string[]>>();
const mockLogout = jest.fn<() => Promise<void>>();
const mockLogin = jest.fn<() => Promise<SessionResponse>>();
const mockMount = jest.fn();
let mockSignIn: (email: string, password: string) => Promise<SessionResponse>;
const mockDisablePush = jest.fn<() => Promise<void>>();
jest.mock("firebase/auth", () => ({
  onIdTokenChanged: (_auth: unknown, listener: (user: unknown) => void) => {
    mockListener = listener;
    return jest.fn();
  },
}));
jest.mock("../firebase/client", () => ({
  firebaseClient: () => ({ auth: mockAuth }),
}));
jest.mock("../auth", () => ({
  ApiError: class ApiError extends Error {},
  currentSession: () => mockCurrentSession(),
  logout: () => mockLogout(),
  login: () => mockLogin(),
  registerOwner: jest.fn(),
  completeOwnerRegistration: jest.fn(),
}));
jest.mock("../device-recovery", () => ({
  disableRecoveryPush: () => mockDisablePush(),
}));
import { AuthProvider, useAuth } from "../auth-context";
import {
  cachedRequest,
  clearCached,
  setCacheIdentity,
} from "../resource-cache";
function PrivateData() {
  const [data, setData] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void cachedRequest("care:records:", mockLoader)
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return <Text>{data.join(",")}</Text>;
}
function Probe() {
  const { state, signOut, signIn } = useAuth();
  mockSignIn = signIn;
  useEffect(() => {
    mockMount();
  }, []);
  mockSignOut = signOut;
  return (
    <>
      <Text>
        {state.status === "ready" ? state.session.displayName : state.status}
      </Text>
      {state.status === "ready" ? <PrivateData /> : null}
    </>
  );
}
function session(name: string): SessionResponse {
  return {
    role: "OWNER",
    status: "ACTIVE",
    displayName: name,
    email: name + "@example.test",
  };
}
function emit(uid: string) {
  mockAuth.currentUser = { uid, email: uid + "@example.test" };
  mockListener(mockAuth.currentUser);
}
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.currentUser = null;
  setCacheIdentity(null);
  clearCached();
  mockDisablePush.mockResolvedValue(undefined);
  mockLogout.mockImplementation(async () => {
    mockAuth.currentUser = null;
    mockListener(null);
  });
});
it("blocks old private screens and loads fresh data on a direct A to B identity change", async () => {
  mockCurrentSession.mockResolvedValue(session("Owner A"));
  mockLoader.mockResolvedValue(["Private A"]);
  const view = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    emit("a");
  });
  await waitFor(() => expect(view.getByText("Private A")).toBeTruthy());
  let resolve!: (value: SessionResponse) => void;
  mockCurrentSession.mockImplementation(
    () =>
      new Promise<SessionResponse>((r) => {
        resolve = r;
      }),
  );
  mockLoader.mockResolvedValue(["Private B"]);
  await act(async () => {
    emit("b");
  });
  expect(view.queryByText("Owner A")).toBeNull();
  expect(view.queryByText("Private A")).toBeNull();
  expect(view.getByText("loading")).toBeTruthy();
  await act(async () => {
    resolve(session("Owner B"));
  });
  await waitFor(() => expect(view.getByText("Private B")).toBeTruthy());
  expect(mockLoader).toHaveBeenCalledTimes(2);
  await act(async () => {
    emit("b");
  });
  expect(view.getByText("Private B")).toBeTruthy();
  await act(async () => {
    resolve(session("Owner B"));
  });
});
it("ignores a slow previous account session response", async () => {
  let resolveA!: (value: SessionResponse) => void;
  mockCurrentSession
    .mockImplementationOnce(
      () =>
        new Promise<SessionResponse>((r) => {
          resolveA = r;
        }),
    )
    .mockResolvedValue(session("Owner B"));
  mockLoader.mockResolvedValue(["Private B"]);
  const view = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    emit("a");
  });
  await act(async () => {
    emit("b");
  });
  await waitFor(() => expect(view.getByText("Owner B")).toBeTruthy());
  await act(async () => {
    resolveA(session("Owner A"));
  });
  expect(view.queryByText("Owner A")).toBeNull();
  expect(view.getByText("Private B")).toBeTruthy();
});
it("signs out and clears private data even if push cleanup is offline", async () => {
  mockCurrentSession.mockResolvedValue(session("Owner A"));
  mockLoader.mockResolvedValue(["Private A"]);
  mockDisablePush.mockRejectedValue(new Error("offline"));
  const view = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    emit("a");
  });
  await waitFor(() => expect(view.getByText("Private A")).toBeTruthy());
  await act(async () => {
    await mockSignOut();
  });
  expect(mockLogout).toHaveBeenCalledTimes(1);
  expect(view.getByText("guest")).toBeTruthy();
  expect(view.queryByText("Private A")).toBeNull();
});

it("keeps the guest sign-in form mounted after an invalid credential error", async () => {
  mockLogin.mockRejectedValue(new Error("Incorrect email or password."));
  const view = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    mockListener(null);
  });
  const mounted = mockMount.mock.calls.length;
  await act(async () => {
    await expect(mockSignIn("owner@example.test", "bad")).rejects.toThrow(
      "Incorrect",
    );
  });
  expect(view.getByText("guest")).toBeTruthy();
  expect(mockMount.mock.calls.length).toBe(mounted);
});

it("does not restore private data when logout fails after the identity is cleared", async () => {
  mockCurrentSession.mockResolvedValue(session("Owner A"));
  mockLoader.mockResolvedValue(["Private A"]);
  mockLogout.mockImplementation(async () => {
    mockAuth.currentUser = null;
    mockListener(null);
    throw new Error("logout timed out");
  });
  const view = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    emit("a");
  });
  await waitFor(() => expect(view.getByText("Private A")).toBeTruthy());
  await act(async () => {
    await expect(mockSignOut()).rejects.toThrow("logout timed out");
  });
  expect(view.getByText("guest")).toBeTruthy();
  expect(view.queryByText("Owner A")).toBeNull();
  expect(view.queryByText("Private A")).toBeNull();
});

it("loads the new identity when logout fails during an account switch", async () => {
  mockCurrentSession.mockResolvedValue(session("Owner A"));
  mockLoader.mockResolvedValue(["Private A"]);
  const view = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    emit("a");
  });
  await waitFor(() => expect(view.getByText("Private A")).toBeTruthy());
  mockCurrentSession.mockResolvedValue(session("Owner B"));
  mockLoader.mockResolvedValue(["Private B"]);
  mockLogout.mockImplementation(async () => {
    emit("b");
    throw new Error("logout timed out");
  });
  await act(async () => {
    await expect(mockSignOut()).rejects.toThrow("logout timed out");
  });
  await waitFor(() => expect(view.getByText("Private B")).toBeTruthy());
  expect(view.queryByText("Owner A")).toBeNull();
  expect(view.queryByText("Private A")).toBeNull();
});
