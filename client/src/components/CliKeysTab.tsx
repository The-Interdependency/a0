// 145:0
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Key, Trash2, Plus, Copy, Terminal } from "lucide-react";

interface CliKey {
  id: number;
  key_prefix: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

export default function CliKeysTab() {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyId, setNewKeyId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ keys: CliKey[] }>({
    queryKey: ["/api/v1/cli/keys"],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/v1/cli/keys", { label: label.trim() || undefined }),
    onSuccess: async (res) => {
      const json = await res.json();
      setNewKey(json.key);
      setNewKeyId(json.id);
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/cli/keys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/v1/cli/keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/cli/keys"] });
      toast({ title: "Key revoked" });
    },
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const keys = data?.keys ?? [];

  return (
    <div className="p-4 space-y-6 max-w-2xl" data-testid="cli-keys-tab">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Terminal className="h-4 w-4" />
        <span>CLI keys let you chat with a0 from any terminal using the <code className="bg-muted px-1 rounded">a0</code> command.</span>
      </div>

      {newKey && (
        <div className="border border-yellow-500/40 bg-yellow-500/10 rounded-md p-4 space-y-2" data-testid="new-key-banner">
          <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">Save this key — it won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted rounded px-2 py-1 break-all" data-testid="new-key-value">{newKey}</code>
            <Button size="icon" variant="ghost" onClick={() => copy(newKey)} data-testid="button-copy-key">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setNewKey(null); setNewKeyId(null); }} data-testid="button-dismiss-key">
            Dismiss
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Generate a new key</p>
        <div className="flex gap-2">
          <Input
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            data-testid="input-key-label"
            className="max-w-xs"
          />
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            data-testid="button-generate-key"
          >
            <Plus className="h-4 w-4 mr-1" />
            Generate
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Your keys</p>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && keys.length === 0 && (
          <p className="text-sm text-muted-foreground">No keys yet.</p>
        )}
        {keys.map((k) => (
          <div
            key={k.id}
            className="flex items-center gap-3 border rounded-md px-3 py-2"
            data-testid={`cli-key-row-${k.id}`}
          >
            <Key className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{k.label}</p>
              <p className="text-xs text-muted-foreground">
                a0k_{k.key_prefix}… &nbsp;·&nbsp;
                {k.last_used_at
                  ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}`
                  : `Created ${new Date(k.created_at).toLocaleDateString()}`}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => revokeMutation.mutate(k.id)}
              disabled={revokeMutation.isPending}
              data-testid={`button-revoke-key-${k.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="border rounded-md p-4 space-y-2 bg-muted/30">
        <p className="text-sm font-semibold">Setup (Termux / any shell)</p>
        <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
{`# Install
mkdir -p ~/.local/bin
curl -fsSL ${window.location.origin}/a0 -o ~/.local/bin/a0
chmod +x ~/.local/bin/a0
export PATH="$HOME/.local/bin:$PATH"

# Configure (paste your key from above)
export A0_KEY="a0k_..."
export A0_HOST="${window.location.origin}"

# One-shot
a0 "what tier am I?"

# Interactive REPL
a0`}
        </pre>
        <Button
          size="sm"
          variant="outline"
          onClick={() => copy(`mkdir -p ~/.local/bin && curl -fsSL ${window.location.origin}/a0 -o ~/.local/bin/a0 && chmod +x ~/.local/bin/a0`)}
          data-testid="button-copy-install"
        >
          <Copy className="h-4 w-4 mr-1" /> Copy install command
        </Button>
      </div>
    </div>
  );
}
// 145:0
