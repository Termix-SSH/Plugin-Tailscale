import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

const DEFAULT_API_BASE = "https://api.tailscale.com/api/v2";
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

export class DeviceApiError extends Error {
  constructor(public readonly status: number) {
    super(`Device API returned status ${status}`);
  }
}

/** The selected control server's devices, or null with no key set. */
export async function fetchDevices(
  ctx: PluginContext,
): Promise<TailnetDevice[] | null> {
  const apiKey = (await ctx.settings.get<string>("apiKey")) ?? "";
  if (!apiKey) return null;
  const provider = (await ctx.settings.get<string>("provider")) ?? "tailscale";
  if (provider !== "tailscale" && provider !== "headscale") {
    throw new Error("Unknown device API provider");
  }
  const configuredBase = ((await ctx.settings.get<string>("apiBaseUrl")) ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (provider === "headscale" && !configuredBase) {
    throw new Error("Set the Headscale server URL");
  }
  const base = new URL(configuredBase || DEFAULT_API_BASE);
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error("Invalid device API base URL");
  }
  const endpoint =
    provider === "headscale" ? "/api/v1/node" : "/tailnet/-/devices?fields=all";
  const response = await ctx
    .fetch(`${base.href.replace(/\/+$/, "")}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "Termix/1.0",
      },
      allowPrivateHosts: [base.hostname],
      redirect: "error",
    })
    .catch(() => {
      throw new Error("Could not reach device API");
    });
  if (!response.ok) throw new DeviceApiError(response.status);
  const data = (await response.json().catch(() => {
    throw new Error("Invalid device API response");
  })) as Record<string, unknown>;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid device API response");
  }
  const listKey = provider === "headscale" ? "nodes" : "devices";
  const records = data[listKey];
  // Protobuf JSON can omit empty repeated fields or represent them as null.
  if (records == null && (listKey in data || Object.keys(data).length === 0))
    return [];
  if (!Array.isArray(records)) throw new Error("Invalid device API response");
  const now = Date.now();
  return records.map((d: Record<string, unknown>) => {
    const headscale = provider === "headscale";
    const lastSeen = String(d.lastSeen ?? "");
    const seen = Date.parse(lastSeen);
    const hostname = headscale
      ? String(d.givenName || d.name || "")
      : String(d.hostname ?? "");
    const addresses = headscale ? d.ipAddresses : d.addresses;
    // Headscale nodes include key material. Project only public inventory fields.
    return {
      id: String(d.id),
      name: headscale ? hostname : String(d.name ?? ""),
      hostname,
      addresses: Array.isArray(addresses)
        ? addresses.filter((ip): ip is string => typeof ip === "string")
        : [],
      os: headscale ? "" : String(d.os ?? ""),
      lastSeen,
      online: headscale
        ? d.online === true
        : d.connectedToControl === true || now - seen < ONLINE_MS,
    };
  });
}
