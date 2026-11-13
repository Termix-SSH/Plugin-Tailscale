import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import {
  startTailscaleService,
  stopTailscaleService,
} from "../../src/backend/routes.js";
import fixture from "../fixtures/headscale-0.25.1.json";

let server: http.Server | undefined;
afterEach(async () => {
  stopTailscaleService();
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  );
  server = undefined;
});

async function start(status = 200, allowed = true, thrown?: Error) {
  const request = vi.fn(async (_url: unknown, _init?: unknown) => {
    if (thrown) throw thrown;
    return new Response(JSON.stringify(fixture), { status });
  });
  const mock = createMockCtx({
    sandbox: true,
    pluginId: "tailscale",
    capabilities: ["network:outbound"],
    permissions: allowed ? ["tailscale.devices.view"] : [],
    settings: {
      provider: "headscale",
      apiKey: "synthetic-secret",
      apiBaseUrl: "https://headscale.example",
    },
    fetch: request,
  });
  const error = vi.spyOn(mock.ctx.log, "error");
  const app = express();
  startTailscaleService(app, mock.ctx);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/devices`);
  return {
    status: response.status,
    body: await response.json(),
    request,
    error,
  };
}

describe("Headscale device route", () => {
  it("returns mapped inventory through the shared provider adapter", async () => {
    const result = await start();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      hasApiKey: true,
      devices: [
        { id: "18446744073709551614", hostname: "gateway", online: true },
        { id: "2", online: false },
        { id: "3", online: false },
      ],
    });
    expect(result.request).toHaveBeenCalledWith(
      "https://headscale.example/api/v1/node",
      expect.anything(),
    );
    expect(JSON.stringify(result.body)).not.toMatch(
      /machineKey|nodeKey|preAuthKey|synthetic-secret|owner/,
    );
  });

  it("retains inventory permission checks before fetching secrets", async () => {
    const result = await start(200, false);
    expect(result.status).toBe(403);
    expect(result.request).not.toHaveBeenCalled();
  });

  it.each([
    [401, 401],
    [403, 401],
    [500, 502],
  ])(
    "keeps API failure %s visible without provider fallback",
    async (remote, expected) => {
      const result = await start(remote);
      expect(result.status).toBe(expected);
      expect(result.body).toMatchObject({ devices: [], hasApiKey: true });
      expect(result.request).toHaveBeenCalledTimes(1);
    },
  );

  it("does not include an upstream error's secrets in logs or responses", async () => {
    const result = await start(
      200,
      true,
      new Error("Authorization: Bearer synthetic-secret"),
    );
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("synthetic-secret");
    expect(result.error).toHaveBeenCalledWith(
      "Failed to fetch tailnet devices",
    );
  });
});
