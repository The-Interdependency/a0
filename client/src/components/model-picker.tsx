// 68:10
// Per-conversation model picker for the chat composer (single mode only).
// Reads /api/energy/providers, groups enabled models by provider, lets the
// user pick one model for the next send. "auto" means: don't include a
// `model` field in the request body — backend falls back through its
// resolution chain (agent model > active_provider > conv model). The
// picker reuses the public read of /api/energy/providers (no admin needed)
// so this works for every signed-in user, not just admins.

import { useQuery } from "@tanstack/react-query";

interface AvailableModel {
  id: string;
  label?: string;
}

interface ProviderEntry {
  id: string;
  label: string;
  available: boolean;
  active: boolean;
  route_config: {
    enabled?: boolean;
    disabled_models?: string[];
    available_models?: AvailableModel[];
  };
}

export function ModelPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (modelId: string | null) => void;
}) {
  const { data: providers = [] } = useQuery<ProviderEntry[]>({
    queryKey: ["/api/energy/providers"],
    refetchInterval: 60_000,
  });

  // Build the option list: "auto" + each enabled-and-available provider's
  // enabled models. We mirror the same gating logic the providers page
  // uses so the picker stays consistent with what the backend will accept.
  const groups = providers
    .filter((p) => p.available && p.route_config.enabled !== false)
    .map((p) => {
      const disabled = new Set(p.route_config.disabled_models ?? []);
      const models = (p.route_config.available_models ?? []).filter(
        (m) => !disabled.has(m.id),
      );
      return { provider: p, models };
    })
    .filter((g) => g.models.length > 0);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="bg-transparent border border-border rounded-sm px-1 py-0.5 text-[10px] text-foreground hover-elevate focus:outline-none focus:ring-1 focus:ring-primary max-w-[180px]"
      data-testid="select-message-model"
      title="Pick a model for this message only (auto = use default routing)"
    >
      <option value="" data-testid="option-model-auto">
        auto (use default)
      </option>
      {groups.map((g) => (
        <optgroup
          key={g.provider.id}
          label={g.provider.label}
          data-testid={`optgroup-provider-${g.provider.id}`}
        >
          {g.models.map((m) => (
            <option
              key={m.id}
              value={m.id}
              data-testid={`option-model-${m.id}`}
            >
              {m.label || m.id}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
// 68:10
