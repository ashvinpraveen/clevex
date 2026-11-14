"use client";

import { Check, ChevronDown, Gauge } from "lucide-react";
import { ProviderGlyph } from "@/components/brand";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useCredentials } from "@/lib/auth/store";
import { MODELS, modelLabel, providerOf } from "@/lib/ai/models";
import type { Effort } from "@/lib/ai/wire";
import { useServerConfig } from "@/lib/server-config";
import { updateSettings, useSettings } from "@/lib/settings";
import type { ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModelPicker({
  onConnect,
}: {
  onConnect: (p: ProviderId) => void;
}) {
  const { model, effort } = useSettings();
  const creds = useCredentials();
  const server = useServerConfig();
  const ready = (p: ProviderId) =>
    p === "chatgpt"
      ? !!creds.chatgpt?.sharing || !!server?.serverChatGPT
      : !!creds.claude || !!server?.serverClaude;

  return (
    <Menu>
      <MenuTrigger className="inline-flex h-7 max-w-[13rem] items-center gap-1.5 rounded-lg px-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground data-popup-open:bg-accent">
        <ProviderGlyph provider={providerOf(model)} className="size-3.5" />
        <span className="truncate">{modelLabel(model)}</span>
        <ChevronDown className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start" side="top" className="min-w-60">
        {(["claude", "chatgpt"] as const).map((p) => (
          <MenuGroup key={p}>
            <MenuGroupLabel className="flex items-center gap-1.5">
              <ProviderGlyph provider={p} className="size-3" />{" "}
              {p === "chatgpt"
                ? creds.chatgpt?.sharing
                  ? "Using ChatGPT plan"
                  : "ChatGPT"
                : "Claude subscription"}
            </MenuGroupLabel>
            {ready(p) ? (
              (p === "chatgpt" && creds.chatgpt
                ? creds.chatgpt.models
                : MODELS.filter((m) => m.provider === p)
              ).map((m) => (
                <MenuItem
                  key={m.id}
                  onClick={() => updateSettings({ model: m.id })}
                  className="justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Check
                      className={cn(
                        "size-3.5",
                        m.id === model ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {m.label}
                  </span>
                  {m.hint && (
                    <span className="text-muted-foreground text-xs">
                      {m.hint}
                    </span>
                  )}
                </MenuItem>
              ))
            ) : (
              <MenuItem
                onClick={() => onConnect(p)}
                className="text-brand-strong"
              >
                Connect {p === "chatgpt" ? "ChatGPT" : "Claude"}…
              </MenuItem>
            )}
            {p === "chatgpt" && creds.chatgpt?.sharing && (
              <MenuItem
                onClick={() =>
                  window.open(
                    "https://chatgpt.com/#settings/Usage",
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Manage ChatGPT usage
              </MenuItem>
            )}
            <MenuSeparator />
          </MenuGroup>
        ))}
        <MenuGroup>
          <MenuGroupLabel className="flex items-center gap-1.5">
            <Gauge className="size-3" /> Reasoning effort
          </MenuGroupLabel>
          <MenuRadioGroup
            value={effort}
            onValueChange={(v) => updateSettings({ effort: v as Effort })}
          >
            <MenuRadioItem value="low">Low · fastest</MenuRadioItem>
            <MenuRadioItem value="medium">Medium</MenuRadioItem>
            <MenuRadioItem value="high">High · most thorough</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
