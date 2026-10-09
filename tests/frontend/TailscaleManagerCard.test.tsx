import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  host: null as Record<string, unknown> | null,
  user: { userId: "u1", username: "u1", isAdmin: false },
  get: vi.fn(),
}));

vi.mock("@termix-ssh/plugin-sdk/frontend", async (original) => ({
  ...(await original<object>()),
  useHost: () => mocks.host,
  useCurrentUser: () => mocks.user,
  useTranslation: () => ({ t: (key: string) => key, language: "en" }),
  usePluginApi: () => ({
    get: mocks.get,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  }),
}));

import {
  extractError,
  useCanEditHost,
} from "../../src/frontend/useTailscaleManager";
import { TailscaleManagerCard } from "../../src/frontend/TailscaleManagerCard";

afterEach(() => {
  cleanup();
  mocks.host = null;
  mocks.user = { userId: "u1", username: "u1", isAdmin: false };
});

const STATUS = {
  installed: true,
  running: true,
  tailscaleIPs: ["100.1.2.3"],
  hostname: "box",
  peers: [],
  exitNodeInUse: false,
};

describe("tailscale manager edit access", () => {
  it("allows owners, editors and admins but not connect-only users", () => {
    const canEdit = () => renderHook(() => useCanEditHost(7)).result.current;
    mocks.host = { id: "7", isShared: false };
    expect(canEdit()).toBe(true);
    mocks.host = { id: "7", isShared: true, permissionLevel: "edit" };
    expect(canEdit()).toBe(true);
    mocks.host = { id: "7", isShared: true, permissionLevel: "connect" };
    expect(canEdit()).toBe(false);
    mocks.user = { ...mocks.user, isAdmin: true };
    expect(canEdit()).toBe(true);
  });

  it("translates the edit refusal", () => {
    const error = {
      response: { data: { error: "x", code: "HOST_EDIT_REQUIRED" } },
    };
    expect(extractError(error, (key) => key).message).toBe(
      "manager.editRequired",
    );
  });

  it("hides the up/down button from a connect-only user", async () => {
    mocks.get.mockResolvedValue({ data: STATUS });
    mocks.host = { id: "7", isShared: true, permissionLevel: "connect" };
    render(<TailscaleManagerCard hostId={7} />);
    expect(await screen.findByText("box")).toBeTruthy();
    expect(screen.queryByTitle("manager.tsDisable")).toBeNull();
  });

  it("shows the up/down button to an editor", async () => {
    mocks.get.mockResolvedValue({ data: STATUS });
    mocks.host = { id: "7", isShared: true, permissionLevel: "edit" };
    render(<TailscaleManagerCard hostId={7} />);
    expect(await screen.findByText("box")).toBeTruthy();
    expect(screen.getByTitle("manager.tsDisable")).toBeTruthy();
  });
});
