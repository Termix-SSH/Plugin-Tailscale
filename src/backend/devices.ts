import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

const DEFAULT_API_BASE = "https://api.tailscale.com/api/v2";
// Tailscale reports when a device last talked to the control server.
const ONLINE_MS = 5 * 60 * 1000;

export interface TailnetDevice {
  id: string;
  name: string;
  hostname: string;
  addresses: string[];
  os: string;
  lastSeen: string;
  online: boolean;
}

/** The tailnet's devices from the admin API, or null with no key set. */
export async function fetchDevices(
  ctx: PluginContext,
): Promise<TailnetDevice[] | null> {
  const apiKey = (await ctx.settings.get<string>("apiKey")) ?? "";
  if (!apiKey) return null;
  const base =
    ((await ctx.settings.get<string>("apiBaseUrl")) ?? "")
      .trim()
      .replace(/\/+$/, "") || DEFAULT_API_BASE;
  const response = await ctx.fetch(`${base}/tailnet/-/devices?fields=all`, {
    headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "Termix/1.0" },
    allowPrivateHosts: [new URL(base).hostname],
  });
  if (!response.ok) throw new Error(`Tailscale API ${response.status}`);
  const data = (await response.json()) as {
    devices?: Array<Record<string, unknown>>;
  };
  const now = Date.now();
  return (data.devices ?? []).map((d) => {
    const lastSeen = String(d.lastSeen ?? "");
    const seen = Date.parse(lastSeen);
    return {
      id: String(d.id),
      name: String(d.name ?? ""),
      hostname: String(d.hostname ?? ""),
      addresses: Array.isArray(d.addresses) ? (d.addresses as string[]) : [],
      os: String(d.os ?? ""),
      lastSeen,
      online: d.connectedToControl === true || now - seen < ONLINE_MS,
    };
  });
}
