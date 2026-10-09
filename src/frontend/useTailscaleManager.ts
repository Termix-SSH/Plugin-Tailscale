import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useCurrentUser,
  useHost,
  usePluginApi,
  useTranslation,
  type TranslateFn,
} from "@termix-ssh/plugin-sdk/frontend";

export interface ManagerError {
  message: string;
  code?: string;
}

/** Set when the server refuses a change because the user lacks edit access. */
export const HOST_EDIT_REQUIRED = "HOST_EDIT_REQUIRED";

export function extractError(err: unknown, t?: TranslateFn): ManagerError {
  const e = err as {
    response?: { data?: { error?: string; code?: string } };
    message?: string;
  };
  const code = e?.response?.data?.code;
  if (code === HOST_EDIT_REQUIRED && t) {
    return { message: t("manager.editRequired"), code };
  }
  return {
    message: e?.response?.data?.error || e?.message || "Request failed",
    code,
  };
}

/**
 * Whether the user may bring Tailscale up or down on the host (edit access
 * or more). Seeing its status only needs connect. The server checks it too.
 */
export function useCanEditHost(hostId: number | null): boolean {
  const host = useHost(hostId ?? undefined);
  const user = useCurrentUser();
  if (hostId == null) return false;
  if (user?.isAdmin) return true;
  if (!host || !host.isShared) return true;
  return host.permissionLevel === "edit" || host.permissionLevel === "manage";
}

/** Fetch the Tailscale manager card's status on mount + manual refresh. */
export function useTailscaleData<T>(hostId: number | null) {
  const api = usePluginApi();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ManagerError | null>(null);

  const refresh = useCallback(async () => {
    if (hostId == null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(`/host-metrics-manager/${hostId}`);
      setData(res.data);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

interface ActionResult {
  success: boolean;
  output?: string;
}

/** Runs the Tailscale manager card's up/down action with toast feedback. */
export function useTailscaleAction(hostId: number | null) {
  const api = usePluginApi();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (
      action: "up" | "down",
      opts: {
        loadingMsg?: string;
        successMsg?: string;
        failMsg?: string;
        onDone?: () => void;
      } = {},
    ): Promise<ActionResult | null> => {
      if (hostId == null) return null;
      const id = `tailscale-manager-${hostId}`;
      setBusy(true);
      if (opts.loadingMsg) toast.loading(opts.loadingMsg, { id });
      try {
        const res = await api.post<ActionResult>(
          `/host-metrics-manager/${hostId}/action`,
          { action },
        );
        if (res.data.success) {
          if (opts.successMsg)
            toast.success(opts.successMsg, {
              id,
              description: res.data.output?.slice(-200),
            });
          else toast.dismiss(id);
          opts.onDone?.();
        } else {
          toast.error(opts.failMsg ?? res.data.output ?? "Action failed", {
            id,
            description: res.data.output?.slice(-200),
          });
        }
        return res.data;
      } catch (err) {
        toast.error(extractError(err, t).message, { id });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [hostId, t],
  );

  return { busy, run };
}
