import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import { isOnline } from "../../src/frontend/TailscaleCard";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

describe("tailnet dashboard card", () => {
  it("treats a device seen in the last few minutes as online", () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    expect(isOnline("2026-10-21T11:58:00.000Z", now)).toBe(true);
    expect(isOnline("2026-10-21T11:00:00.000Z", now)).toBe(false);
    expect(isOnline("never", now)).toBe(false);
  });

  it("counts online devices", async () => {
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      permissions: ["tailscale.devices.view"],
      api: {
        get: vi.fn(async () => ({
          data: {
            hasApiKey: true,
            devices: [
              {
                id: "1",
                name: "laptop.tail.ts.net",
                hostname: "laptop",
                addresses: ["100.64.0.1"],
                os: "linux",
                lastSeen: new Date().toISOString(),
              },
              {
                id: "2",
                name: "old.tail.ts.net",
                hostname: "old",
                addresses: ["100.64.0.2"],
                os: "windows",
                lastSeen: "2020-01-01T00:00:00.000Z",
              },
            ],
          },
        })),
      } as never,
    });
    expect(rendered.registered.dashboardCards()).toEqual(["tailscale-devices"]);
    rendered.renderDashboardCard("tailscale-devices");
    expect(await screen.findByText("1 of 2 devices online")).toBeTruthy();
    expect(screen.getByText("laptop")).toBeTruthy();
  });
});
