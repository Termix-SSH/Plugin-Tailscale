import { describe, expect, it } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import { startTailscaleAlerts } from "../../src/backend/alerts.js";

const manifest = manifestJson as unknown as PluginManifest;

function reply(devices: Array<{ id: string; seen: number }>) {
  return async () =>
    new Response(
      JSON.stringify({
        devices: devices.map((d) => ({
          id: d.id,
          name: `${d.id}.tail.net`,
          hostname: d.id,
          addresses: ["100.64.0.1"],
          os: "linux",
          lastSeen: new Date(Date.now() - d.seen).toISOString(),
        })),
      }),
    );
}

describe("tailnet alerts", () => {
  it("alerts once when an online device goes offline", async () => {
    let devices = [{ id: "nas", seen: 1000 }];
    const mock = createMockCtx({
      pluginId: manifest.id,
      manifest,
      capabilities: manifest.capabilities,
      settings: { apiKey: "k", alertOffline: true },
      fetch: (url, init) => reply(devices)(),
    });
    const alerts = startTailscaleAlerts(mock.ctx);

    await alerts.tick();
    expect(mock.notifications).toHaveLength(0);

    devices = [{ id: "nas", seen: 3_600_000 }];
    await alerts.tick();
    expect(mock.notifications).toHaveLength(1);
    expect(mock.notifications[0].notification).toMatchObject({
      category: "tailscale.device_offline",
      audience: "admins",
      dedupeKey: "tailscale.device_offline:nas",
    });
    await alerts.tick();
    expect(mock.notifications).toHaveLength(1);
  });

  it("does nothing while the setting is off", async () => {
    const mock = createMockCtx({
      pluginId: manifest.id,
      manifest,
      capabilities: manifest.capabilities,
      settings: { apiKey: "k" },
      fetch: reply([]),
    });
    await startTailscaleAlerts(mock.ctx).tick();
    expect(mock.fetches).toHaveLength(0);
  });
});
