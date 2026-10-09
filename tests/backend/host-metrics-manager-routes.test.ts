import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerTailscaleHostMetricsManager } from "../../src/backend/host-metrics-manager.js";

let server: http.Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  );
  server = null;
});

/** The routes for a user the host was shared with at `level`. */
async function start(level: "none" | "connect" | "edit") {
  const mock = createMockCtx({ pluginId: "tailscale" });
  const ranks = { none: 0, connect: 1, view: 2, edit: 3, manage: 4 };
  mock.ctx.hosts.checkAccess = async (_hostId, wanted) => ({
    hasAccess: ranks[level] >= ranks[wanted],
    isOwner: false,
    isShared: level !== "none",
  });
  // Stops right after the access check.
  mock.ctx.ssh.resolveHost = async () => null;

  const router = express.Router();
  registerTailscaleHostMetricsManager(router, mock.ctx as PluginContext);
  const app = express();
  app.use(express.json());
  app.use(router);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
}

describe("tailscale manager access", () => {
  it("refuses tailscale up/down to a connect-only user", async () => {
    const request = await start("connect");
    const response = await request("POST", "/host-metrics-manager/7/action", {
      action: "up",
    });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "You need edit access to this host to change it",
      code: "HOST_EDIT_REQUIRED",
    });
  });

  it("lets a connect-only user read the status", async () => {
    const request = await start("connect");
    const response = await request("GET", "/host-metrics-manager/7");
    // Past the access check: the stub host lookup is what stops it.
    expect(response.body).toEqual({ error: "Host not found" });
  });

  it("lets an editor past the access check", async () => {
    const request = await start("edit");
    const response = await request("POST", "/host-metrics-manager/7/action", {
      action: "up",
    });
    expect(response.body).toEqual({ error: "Host not found" });
  });

  it("gives the plain error to someone with no access", async () => {
    const request = await start("none");
    const response = await request("POST", "/host-metrics-manager/7/action", {
      action: "up",
    });
    expect(response.body).toEqual({ error: "No access to this host" });
  });
});
