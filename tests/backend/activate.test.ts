import express from "express";
import { describe, expect, it } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import { activate, deactivate } from "../../src/backend/index.js";

const manifest = manifestJson as unknown as PluginManifest;

describe("activate in a plugin process", () => {
  it("registers its auth type, schedule and operations under the process rules", async () => {
    const mock = createMockCtx({
      sandbox: true,
      pluginId: manifest.id,
      manifest,
      capabilities: manifest.capabilities,
      router: () => express.Router(),
    });
    // SDK 2.2.1's sandbox mock still refuses onBanner; 2.2.2 takes it. Drop
    // this once the lock moves to 2.2.2.
    const auth = mock.ctx.auth as unknown as Record<string, unknown>;
    const register = auth.registerSshAuthProvider as (p: unknown) => void;
    auth.registerSshAuthProvider = (provider: never) => {
      try {
        register(provider);
      } catch (error) {
        if ((error as { code?: string }).code !== "SANDBOX_UNSUPPORTED") {
          throw error;
        }
        mock.auth.sshAuthProviders.push(provider);
      }
    };

    await activate(mock.ctx);
    const provider = mock.auth.sshAuthProviders.find(
      (p) => p.type === "tailscale",
    );
    expect(provider).toBeTruthy();
    expect(
      await provider!.onBanner?.(
        "Tailscale SSH requires an additional check. To authenticate, visit: https://login.tailscale.com/a/abc",
        { id: 1, ip: "100.1.1.1", port: 22, username: "root" },
        {} as never,
      ),
    ).toMatchObject({ action: "hold" });
    await deactivate();
  });
});
