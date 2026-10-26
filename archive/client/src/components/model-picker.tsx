// 68:5 0:1 0:1
// Per-conversation model picker for the chat composer (single mode only).
// Reads /api/v1/models, groups enabled models by provider, lets the user
// pick one model for the next send. "auto" means: don't include a `model`
// field in the request body — backend falls back through its resolution
// chain (agent model > default_provider > conv model).

import { useQuery } from "@tanstack/react-query";

interface ModelEntry {
  model_id: string;
  label?: string;
  disabled?: boolean;
}

interface ProviderEntry {
  provider_id: string;
  label: string;
  enabled: boolean;
  key_present: boolean;
  tier_blocked: boolean;
  models: ModelEntry[];
}

interface ModelsResponse {
  user_tier: string;
  providers: ProviderEntry[];
}

export function ModelPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (modelId: string | null) => void;
}) {
  const { data } = useQuery<ModelsResponse>({
    queryKey: ["/api/v1/models"],
    refetchInterval: 60_000,
  });

  const providers = data?.providers ?? [];

  const groups = providers
    .filter((p) => p.key_present && p.enabled && !p.tier_blocked)
    .map((p) => ({
      provider: p,
      models: p.models.filter((m) => !m.disabled),
    }))
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
          key={g.provider.provider_id}
          label={g.provider.label}
          data-testid={`optgroup-provider-${g.provider.provider_id}`}
        >
          {g.models.map((m) => (
            <option
              key={m.model_id}
              value={m.model_id}
              data-testid={`option-model-${m.model_id}`}
            >
              {m.label || m.model_id}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
// 68:5 0:1 0:1
