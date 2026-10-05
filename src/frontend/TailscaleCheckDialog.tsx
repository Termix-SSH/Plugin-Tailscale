import {
  PanePrompt,
  PROMPT_BUTTON,
  PROMPT_PRIMARY_BUTTON,
} from "@termix-ssh/plugin-sdk/ui";
import { Shield, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

interface TailscaleCheckDialogProps {
  isOpen: boolean;
  authUrl: string;
  message?: string;
  stage: "prompt" | "waiting";
  onCancel: () => void;
  onOpenUrl: () => void;
  backgroundColor?: string;
}

export function TailscaleCheckDialog({
  isOpen,
  authUrl,
  message,
  stage,
  onCancel,
  onOpenUrl,
  backgroundColor,
}: TailscaleCheckDialogProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <PanePrompt
      open
      layer="connection"
      backgroundColor={backgroundColor}
      icon={<Shield className="size-4" />}
      title={t("terminal.tailscaleCheckRequired")}
      description={t("terminal.tailscaleCheckDescription")}
      className="max-w-md"
      actions={
        <button type="button" onClick={onCancel} className={PROMPT_BUTTON}>
          {t("common.cancel")}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        {message && (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {message}
          </p>
        )}

        {stage === "prompt" && authUrl && (
          <button
            type="button"
            onClick={onOpenUrl}
            className={`${PROMPT_PRIMARY_BUTTON} w-full`}
          >
            <ExternalLink className="size-3.5" />
            {t("terminal.tailscaleCheckOpenBrowser")}
          </button>
        )}

        {stage === "waiting" && (
          <div className="flex items-center gap-3 py-1">
            <Loader2 className="size-4 animate-spin text-accent-brand shrink-0" />
            <p className="text-xs text-muted-foreground">
              {t("terminal.tailscaleCheckWaiting")}
            </p>
          </div>
        )}
      </div>
    </PanePrompt>
  );
}
