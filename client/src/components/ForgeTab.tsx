// 317:0
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Hammer, Sparkles, Trash2, Loader2, MessageSquare } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ForgeAgentChat from "./ForgeAgentChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Archetype = {
  id: string;
  name: string;
  genre: string;
  blurb: string;
  personality: { traits: string[]; alignment: string; verbosity: number };
  stats: Record<string, number>;
  suggested_tools: string[];
  system_prompt: string;
};

type Tool = { name: string; description: string; category: string };
type Model = {
  id: string; label: string; vendor: string;
  available: boolean; active: boolean;
  min_tier?: string;
};
const TIER_RANK: Record<string, number> = { free: 0, supporter: 1, ws: 2, admin: 3 };
type Agent = {
  id: number;
  name: string;
  archetype: string | null;
  model_id: string | null;
  enabled_tools: string[] | null;
  level: number;
  xp: number;
  hp: number;
  stats: Record<string, number> | null;
  personality: { traits: string[]; alignment: string; verbosity: number } | null;
  avatar_url: string | null;
};

const ALIGNMENTS = [
  "lawful-good", "neutral-good", "chaotic-good",
  "lawful-neutral", "true-neutral", "chaotic-neutral",
  "lawful-evil", "neutral-evil", "chaotic-evil",
];

export default function ForgeTab() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Archetype | null>(null);
  const [name, setName] = useState("");
  const [modelId, setModelId] = useState<string>("");
  const [tools, setTools] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [alignment, setAlignment] = useState("neutral-good");
  const [verbosity, setVerbosity] = useState(5);
  const [traits, setTraits] = useState("");
  const [openChatAgentId, setOpenChatAgentId] = useState<number | null>(null);

  const tplQ = useQuery<{ templates: Archetype[] }>({ queryKey: ["/api/v1/forge/templates"] });
  const toolsQ = useQuery<{ tools: Tool[] }>({ queryKey: ["/api/v1/forge/tools"] });
  const modelsQ = useQuery<{ models: Model[]; user_tier: string }>({ queryKey: ["/api/v1/forge/models"] });
  const userTierRank = TIER_RANK[modelsQ.data?.user_tier ?? "free"] ?? 0;
  const isModelLocked = (m: Model) => !!m.min_tier && (TIER_RANK[m.min_tier] ?? 0) > userTierRank;
  const agentsQ = useQuery<{ agents: Agent[] }>({ queryKey: ["/api/v1/forge/agents"] });

  const pickArchetype = (a: Archetype) => {
    setSelected(a);
    setName(a.name);
    setTools(a.suggested_tools);
    setPrompt(a.system_prompt);
    setAlignment(a.personality.alignment);
    setVerbosity(a.personality.verbosity);
    setTraits(a.personality.traits.join(", "));
  };

  const instantiate = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick an archetype first");
      return await apiRequest("POST", "/api/v1/forge/instantiate", {
        template_id: selected.id,
        name: name.trim(),
        model_id: modelId || undefined,
        enabled_tools: tools,
        system_prompt_override: prompt,
        personality_override: {
          traits: traits.split(",").map(t => t.trim()).filter(Boolean),
          alignment,
          verbosity,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Forged", description: `${name} joins the roster.` });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/forge/agents"] });
      setSelected(null); setName(""); setTools([]); setPrompt("");
    },
    onError: (e: Error) => toast({ title: "Forge failed", description: e.message, variant: "destructive" }),
  });

  const removeAgent = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/v1/forge/agents/${id}`);
      return id;
    },
    onSuccess: (id) => {
      try { localStorage.removeItem(`a0p_forge_active_conv_${id}`); } catch {}
      if (openChatAgentId === id) setOpenChatAgentId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/forge/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/conversations"] });
    },
  });

  const toggleTool = (n: string) =>
    setTools(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const toolsByCategory: Record<string, Tool[]> = {};
  (toolsQ.data?.tools || []).forEach(t => {
    (toolsByCategory[t.category] = toolsByCategory[t.category] || []).push(t);
  });

  return (
    <div className="h-full overflow-auto p-4 space-y-6" data-testid="tab-content-forge">
      <header className="flex items-center gap-3">
        <Hammer className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-forge-title">The Forge</h1>
          <p className="text-sm text-muted-foreground">Pick an archetype, swap in a model, check tools, ship an agent.</p>
        </div>
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Archetypes</h2>
        {tplQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {tplQ.data?.templates.map(a => (
              <Card
                key={a.id}
                className={`cursor-pointer hover-elevate ${selected?.id === a.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => pickArchetype(a)}
                data-testid={`card-archetype-${a.id}`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    {a.name}
                    <Badge variant="outline" className="text-xs">{a.genre}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <p>{a.blurb}</p>
                  <p className="font-mono">{a.personality.alignment}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section className="space-y-4 border rounded-lg p-4 bg-card">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Character Sheet — {selected.name}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="forge-name">Agent Name</Label>
              <Input id="forge-name" value={name} onChange={e => setName(e.target.value)}
                data-testid="input-agent-name" />
            </div>
            <div>
              <Label htmlFor="forge-model">Model</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger id="forge-model" data-testid="select-model">
                  <SelectValue placeholder="Use active model" />
                </SelectTrigger>
                <SelectContent>
                  {modelsQ.data?.models.map(m => {
                    const locked = isModelLocked(m);
                    const disabled = !m.available || locked;
                    return (
                      <SelectItem key={m.id} value={m.id} disabled={disabled}
                        data-testid={`option-model-${m.id}`}>
                        {m.label}
                        {!m.available && " (no key)"}
                        {locked && ` (${m.min_tier}+ only)`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Alignment</Label>
              <div className="grid grid-cols-3 gap-1 mt-1">
                {ALIGNMENTS.map(a => (
                  <Button
                    key={a}
                    type="button"
                    size="sm"
                    variant={alignment === a ? "default" : "outline"}
                    className="text-xs h-8"
                    onClick={() => setAlignment(a)}
                    data-testid={`button-alignment-${a}`}
                  >
                    {a.split("-").map(w => w[0].toUpperCase()).join("")}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{alignment}</p>
            </div>
            <div>
              <Label>Verbosity: {verbosity}</Label>
              <Slider value={[verbosity]} min={1} max={10} step={1}
                onValueChange={v => setVerbosity(v[0])}
                data-testid="slider-verbosity" />
              <Label className="mt-3 block">Traits (comma-separated)</Label>
              <Input value={traits} onChange={e => setTraits(e.target.value)}
                placeholder="witty, terse, optimistic"
                data-testid="input-traits" />
            </div>
          </div>

          <div>
            <Label>Tools ({tools.length} selected)</Label>
            <div className="space-y-3 mt-2 max-h-72 overflow-y-auto border rounded p-3">
              {Object.entries(toolsByCategory).map(([cat, list]) => (
                <div key={cat}>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">{cat}</div>
                  {list.map(t => (
                    <label key={t.name}
                      className="flex items-start gap-2 py-1 cursor-pointer hover-elevate rounded px-1"
                      data-testid={`label-tool-${t.name}`}>
                      <Checkbox
                        checked={tools.includes(t.name)}
                        onCheckedChange={() => toggleTool(t.name)}
                        data-testid={`checkbox-tool-${t.name}`}
                      />
                      <div className="text-xs flex-1">
                        <div className="font-mono font-semibold">{t.name}</div>
                        <div className="text-muted-foreground line-clamp-2">{t.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="forge-prompt">System Prompt</Label>
            <Textarea id="forge-prompt" rows={4} value={prompt}
              onChange={e => setPrompt(e.target.value)}
              data-testid="textarea-system-prompt" />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => instantiate.mutate()}
              disabled={instantiate.isPending || !name.trim()}
              data-testid="button-forge-agent">
              {instantiate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Hammer className="h-4 w-4 mr-2" />}
              Forge Agent
            </Button>
            <Button variant="outline" onClick={() => setSelected(null)}
              data-testid="button-cancel-forge">Cancel</Button>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Your Agents</h2>
        {agentsQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
         (agentsQ.data?.agents.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground italic">No forged agents yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agentsQ.data?.agents.map(a => (
              <Card key={a.id} data-testid={`card-agent-${a.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span data-testid={`text-agent-name-${a.id}`}>{a.name}</span>
                    <div className="flex gap-1">
                      <Button size="icon"
                        variant={openChatAgentId === a.id ? "default" : "ghost"}
                        onClick={() => setOpenChatAgentId(prev => prev === a.id ? null : a.id)}
                        data-testid={`button-chat-agent-${a.id}`}
                        title="Open inline chat with this agent">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeAgent.mutate(a.id)}
                        data-testid={`button-delete-agent-${a.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-1">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">{a.archetype}</Badge>
                    <Badge variant="outline">L{a.level}</Badge>
                    <Badge variant="outline">XP {a.xp}</Badge>
                    <Badge variant="outline">HP {a.hp}</Badge>
                  </div>
                  <p className="text-muted-foreground font-mono">{a.model_id}</p>
                  <p className="text-muted-foreground">Tools: {(a.enabled_tools || []).length}</p>
                  {a.personality && (
                    <p className="text-muted-foreground">{a.personality.alignment} · v{a.personality.verbosity}</p>
                  )}
                </CardContent>
                {openChatAgentId === a.id && (
                  <CardContent className="pt-0">
                    <ForgeAgentChat
                      agentId={a.id}
                      agentName={a.name}
                      onClose={() => setOpenChatAgentId(null)}
                    />
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
// 317:0
