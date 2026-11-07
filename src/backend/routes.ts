import { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

import { DeviceApiError, fetchDevices } from "./devices.js";

/**
 * Set by activate(). Dropped on deactivate so a request arriving mid-teardown
 * cannot read settings through a context the runtime has already torn down.
 */
let context: PluginContext | null = null;

/** Called from activate(). Mounts the plugin's routes on ctx.http.router(). */
export function startTailscaleService(
  mountOn: Router,
  ctx: PluginContext,
): void {
  context = ctx;

  /**
   * @openapi
   * /plugin-api/tailscale/devices:
   *   get:
   *     summary: List Tailscale devices
   *     description: >
   *       Returns the devices in the configured tailnet using the stored admin
   *       API key. Requires the tailscale.devices.view permission, because the
   *       response is a full inventory of the tailnet.
   *     tags:
   *       - Tailscale
   *     responses:
   *       200:
   *         description: List of tailnet devices.
   *       403:
   *         description: The caller lacks tailscale.devices.view.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 devices:
   *                   type: array
   *                   items:
   *                     type: object
   *       500:
   *         description: Failed to fetch Tailscale devices.
   */
  mountOn.get(
    "/devices",
    ctx.rbac.require("devices.view") as never,
    async (_req, res) => {
      try {
        if (!context) {
          return res
            .status(503)
            .json({ error: "Tailscale is not available", devices: [] });
        }
        const devices = await fetchDevices(context);
        res.json({ devices: devices ?? [], hasApiKey: devices !== null });
      } catch (err) {
        // Do not log fetch errors or response bodies: they can contain credentials.
        if (err instanceof DeviceApiError) {
          context?.log.warn(`Device API returned non-OK status ${err.status}`);
          return res
            .status(err.status === 401 || err.status === 403 ? 401 : 502)
            .json({
              error:
                err.status === 401 || err.status === 403
                  ? "Invalid device API key"
                  : "Device API error",
              devices: [],
              hasApiKey: true,
            });
        }
        context?.log.error("Failed to fetch tailnet devices");
        res.status(500).json({
          error: "Failed to fetch tailnet devices",
          devices: [],
          hasApiKey: true,
        });
      }
    },
  );
}

/** Called from deactivate(). /plugin-api/tailscale/* falls back to 404 until
 * reactivated. */
export function stopTailscaleService(): void {
  context = null;
}
