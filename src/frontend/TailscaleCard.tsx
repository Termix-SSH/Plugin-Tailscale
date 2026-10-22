import { useCallback, useEffect, useState } from "react";
import { Radar } from "lucide-react";
import {
  usePermission,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import {
  getTailscaleDevices,
  type TailscaleDevicesResponse,
} from "./tailscale-api";

const POLL_MS = 60_000;
// Tailscale reports when a device last talked to the control server.
const ONLINE_MS = 5 * 60 * 1000;

/** Whether a device was seen in the last few minutes. */
export function isOnline(lastSeen: string, now = Date.now()): boolean {
  const seen = Date.parse(lastSeen);
  return Number.isFinite(seen) && now - seen < ONLINE_MS;
}

/** Dashboard card: how many tailnet devices are online, and which. */
export function TailscaleCard({ isVisible, shell }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("devices.view");
  const [data, setData] = useState<TailscaleDevicesResponse | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getTailscaleDevices());
    } catch (error) {
      setData({
        devices: [],
        hasApiKey: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  if (!allowed) return null;
  if (!data) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("card.loading")}</p>
    );
  }
  if (!data.hasApiKey) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("card.noKey")}</p>
    );
  }
  if (data.error) {
    return <p className="p-3 text-xs text-destructive">{data.error}</p>;
  }

  const devices = [...data.devices].sort(
    (a, b) =>
      Number(isOnline(b.lastSeen)) - Number(isOnline(a.lastSeen)) ||
      a.name.localeCompare(b.name),
  );
  const online = devices.filter((device) => isOnline(device.lastSeen)).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <button
        type="button"
        onClick={() => shell.openRailView("tailscale")}
        className="px-3 pt-2 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        {t("card.online", { online, total: devices.length })}
      </button>
      <PanelList>
        {devices.map((device, index) => (
          <ListRow
            key={device.id}
            stripe={index}
            tone={isOnline(device.lastSeen) ? "success" : "muted"}
            dimmed={!isOnline(device.lastSeen)}
            icon={<Radar className="size-3.5" />}
            title={device.name.split(".")[0] || device.hostname}
            meta={[device.addresses[0], device.os].filter(Boolean).join(" | ")}
          />
        ))}
      </PanelList>
    </div>
  );
}
