import { describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import { fetchDevices, DeviceApiError } from "../../src/backend/devices.js";
// Synthetic data shaped by Headscale v0.25.1's node.proto / grpc-gateway JSON.
import fixture from "../fixtures/headscale-0.25.1.json";

function setup(
  settings: Record<string, unknown> = {},
  body: unknown = fixture,
  status = 200,
) {
  const request = vi.fn(
    async (_url: unknown, _init?: unknown) =>
      new Response(JSON.stringify(body), { status }),
  );
  const mock = createMockCtx({
    pluginId: "tailscale",
    capabilities: ["network:outbound"],
    settings: {
      apiKey: "synthetic-key",
      provider: "headscale",
      apiBaseUrl: "https://control.example/prefix/",
      ...settings,
    },
    fetch: request,
  });
  return { ...mock, request };
}

describe("control server device discovery", () => {
  it("maps the Headscale schema without keys or uint64 precision loss", async () => {
    const { ctx, request } = setup();
    expect(await fetchDevices(ctx)).toEqual([
      {
        id: "18446744073709551614",
        name: "gateway",
        hostname: "gateway",
        addresses: ["100.64.0.10", "fd7a:115c:a1e0::a"],
        os: "",
        lastSeen: "2020-01-01T00:00:00Z",
        online: true,
      },
      {
        id: "2",
        name: "laptop",
        hostname: "laptop",
        addresses: ["100.64.0.11"],
        os: "",
        lastSeen: "2099-01-01T00:00:00Z",
        online: false,
      },
      {
        id: "3",
        name: "offline",
        hostname: "offline",
        addresses: [],
        os: "",
        lastSeen: "",
        online: false,
      },
    ]);
    expect(request).toHaveBeenCalledWith(
      "https://control.example/prefix/api/v1/node",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer synthetic-key",
          "User-Agent": "Termix/1.0",
        },
        allowPrivateHosts: ["control.example"],
        redirect: "error",
      }),
    );
  });

  it("keeps Tailscale as the default regardless of key prefix", async () => {
    const { ctx, request } = setup(
      {
        provider: undefined,
        apiKey: "hskey-not-provider-detection",
        apiBaseUrl: "",
      },
      {
        devices: [
          {
            id: "ts",
            hostname: "box",
            name: "box.tail.net",
            addresses: ["100.64.0.1"],
            os: "linux",
            connectedToControl: true,
          },
        ],
      },
    );
    expect(await fetchDevices(ctx)).toEqual([
      expect.objectContaining({
        id: "ts",
        hostname: "box",
        os: "linux",
        online: true,
      }),
    ]);
    expect(request.mock.calls[0][0]).toBe(
      "https://api.tailscale.com/api/v2/tailnet/-/devices?fields=all",
    );
  });

  it("preserves custom Tailscale API bases", async () => {
    const { ctx, request } = setup(
      { provider: "tailscale", apiBaseUrl: "https://proxy.example/api/v2/" },
      { devices: [] },
    );
    expect(await fetchDevices(ctx)).toEqual([]);
    expect(request.mock.calls[0][0]).toBe(
      "https://proxy.example/api/v2/tailnet/-/devices?fields=all",
    );
  });

  it("does nothing without an API key", async () => {
    const { ctx, request } = setup({ apiKey: "" });
    expect(await fetchDevices(ctx)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { provider: "guess" },
    { apiBaseUrl: "" },
    { apiBaseUrl: "invalid" },
    { apiBaseUrl: "https://user:secret@control.example" },
    { apiBaseUrl: "https://control.example?token=secret" },
    { apiBaseUrl: "file:///tmp/headscale" },
  ])(
    "does not send credentials for invalid configuration %j",
    async (settings) => {
      const { ctx, request } = setup(settings);
      await expect(fetchDevices(ctx)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 404, 500])(
    "does not probe or fall back after HTTP %s",
    async (status) => {
      const { ctx, request } = setup({}, { error: "opaque" }, status);
      await expect(fetchDevices(ctx)).rejects.toEqual(
        new DeviceApiError(status),
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("does not propagate credential-bearing fetch errors to alert or operation callers", async () => {
    const { ctx, request } = setup();
    request.mockRejectedValueOnce(
      new Error("Authorization: Bearer synthetic-key"),
    );
    await expect(fetchDevices(ctx)).rejects.toThrow(
      "Could not reach device API",
    );
  });

  it.each(["headscale", "tailscale"])(
    "accepts empty %s inventories",
    async (provider) => {
      const key = provider === "headscale" ? "nodes" : "devices";
      for (const body of [{}, { [key]: [] }, { [key]: null }]) {
        const { ctx } = setup({ provider }, body);
        expect(await fetchDevices(ctx)).toEqual([]);
      }
    },
  );

  it.each([
    { nodes: {} },
    { nodes: "empty" },
    { error: "unauthorized" },
    null,
    [],
  ])("rejects malformed successful responses %j", async (body) => {
    const { ctx } = setup({}, body);
    await expect(fetchDevices(ctx)).rejects.toThrow(
      "Invalid device API response",
    );
  });

  it("does not treat a Tailscale response as an empty Headscale inventory", async () => {
    const { ctx, request } = setup({}, { devices: [] });
    await expect(fetchDevices(ctx)).rejects.toThrow(
      "Invalid device API response",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
});
