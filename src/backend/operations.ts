import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import {
  execCommand,
  execElevated,
} from "@termix-ssh/plugin-sdk/host-commands";
import {
  parseTailscaleData,
  PROBE_CMD,
  resolveManagerHost,
} from "./host-metrics-manager.js";
import { withSshConnection } from "./ssh.js";

const CONNECTION = { pool: "tailscale", purpose: "metrics" } as const;

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

/** Everything Tailscale offers to the rest of Termix. */
export function registerOperations(ctx: PluginContext): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("tailscale.status", {
    run: async (_input, context) => {
      const host = await resolveManagerHost(ctx, requireHost(context));
      const data = await withSshConnection(
        host.id,
        CONNECTION,
        async (client) =>
          parseTailscaleData(
            (await execCommand(client, PROBE_CMD, 15000)).stdout,
          ),
      );
      const label = !data.installed
        ? "Not installed"
        : data.running
          ? `Connected as ${data.hostname ?? "this host"}`
          : "Disconnected";
      return {
        summary: label,
        data: {
          value: data.running ? "up" : "down",
          status: !data.installed ? "unknown" : data.running ? "ok" : "warn",
          label,
          items: data.tailscaleIPs.map((ip) => ({ label: ip })),
        },
      };
    },
  });

  for (const [id, verb] of [
    ["tailscale.up", "up"],
    ["tailscale.down", "down"],
  ] as const) {
    ctx.operations.register(id, {
      describe: () => `Would run tailscale ${verb}`,
      run: async (_input, context) => {
        const host = await resolveManagerHost(
          ctx,
          requireHost(context),
          "edit",
        );
        const result = await withSshConnection(host.id, CONNECTION, (client) =>
          execElevated(client, `tailscale ${verb}`, host.sudoPassword, {
            forceSudo: false,
            timeoutMs: 30000,
          }),
        );
        const output = (result.stdout + result.stderr).trim();
        if (result.code !== 0) {
          throw new Error(output || `tailscale ${verb} failed`);
        }
        return { summary: `tailscale ${verb} done`, changed: true };
      },
    });
  }
}
