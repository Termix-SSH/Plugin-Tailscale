import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { fetchDevices } from "./devices.js";

const CHECK_MS = 5 * 60 * 1000;

/** Alerts admins when a tailnet device that was online goes offline. */
export function startTailscaleAlerts(ctx: PluginContext) {
  let online: Set<string> | null = null;

  const tick = async () => {
    if ((await ctx.settings.get<boolean>("alertOffline")) !== true) {
      online = null;
      return;
    }
    const devices = await fetchDevices(ctx);
    if (!devices) return;
    const now = new Set(devices.filter((d) => d.online).map((d) => d.id));
    if (online) {
      for (const device of devices) {
        if (device.online || !online.has(device.id)) continue;
        await ctx.notify
          .send({
            title: `${device.hostname || device.name} went offline`,
            body: "This device left the tailnet.",
            severity: "warning",
            category: "tailscale.device_offline",
            audience: "admins",
            link: { tab: "tailscale" },
            dedupeKey: `tailscale.device_offline:${device.id}`,
          })
          .catch(() => undefined);
      }
    }
    online = now;
  };

  ctx.disposables.add(
    ctx.schedule.every(
      CHECK_MS,
      () =>
        tick().catch((error) =>
          ctx.log.debug(`Tailnet check failed: ${String(error)}`),
        ),
      { jitterMs: 10_000 },
    ),
  );
  return { tick };
}
