// 164:0
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

const HANDLER_TEMPLATE = `from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/custom/your-slug")

@router.get("/")
async def hello():
    return {"message": "Hello from your custom module!"}
`;

const UI_META_TEMPLATE = JSON.stringify(
  { tab_id: "", label: "", tier: "ws", icon: "" },
  null, 2,
);
const ROUTE_CONFIG_TEMPLATE = JSON.stringify(
  { prefix: "/api/v1/custom/your-slug", methods: ["GET"] },
  null, 2,
);

interface Props {
  onClose: () => void;
  onCreated: (id: number) => void;
}

export default function NewModulePanel({ onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [handlerCode, setHandlerCode] = useState(HANDLER_TEMPLATE);
  const [uiMetaStr, setUiMetaStr] = useState(UI_META_TEMPLATE);
  const [routeConfigStr, setRouteConfigStr] = useState(ROUTE_CONFIG_TEMPLATE);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      setJsonError(null);
      let uiMeta: Record<string, unknown>;
      let routeConfig: Record<string, unknown>;
      try { uiMeta = JSON.parse(uiMetaStr); } catch {
        setJsonError("UI Meta is not valid JSON"); throw new Error("JSON");
      }
      try { routeConfig = JSON.parse(routeConfigStr); } catch {
        setJsonError("Route Config is not valid JSON"); throw new Error("JSON");
      }
      const tokenRes = await apiRequest("GET", "/api/v1/ws/modules/new/write-token");
      const { token } = await tokenRes.json();
      const res = await apiRequest("POST", "/api/v1/ws/modules", {
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        handler_code: handlerCode,
        ui_meta: uiMeta,
        route_config: routeConfig,
        write_token: token,
      });
      return res.json();
    },
    onSuccess: (data: { id: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ws/modules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ui/structure"] });
      toast({ title: "Module created", description: `"${name.trim()}" ready. Open it to deploy.` });
      onCreated(data.id);
    },
    onError: (e: Error) => {
      if (e.message !== "JSON") {
        toast({ title: "Create failed", description: e.message, variant: "destructive" });
      }
    },
  });

  const canSubmit = slug.trim().length > 0 && name.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="flex flex-col h-full" data-testid="new-module-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold">New Module</span>
        <Button size="sm" variant="ghost" onClick={onClose} data-testid="btn-close-new-module">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Slug <span className="text-muted-foreground">(unique, URL-safe)</span></Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-module"
              className="h-8 text-sm font-mono"
              data-testid="input-new-slug"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Module"
              className="h-8 text-sm"
              data-testid="input-new-name"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this module do?"
            className="h-8 text-sm"
            data-testid="input-new-description"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Handler Code (Python)</Label>
          <Textarea
            value={handlerCode}
            onChange={(e) => setHandlerCode(e.target.value)}
            className="font-mono text-xs min-h-[200px] resize-y"
            spellCheck={false}
            data-testid="textarea-new-handler-code"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">UI Meta (JSON)</Label>
          <Textarea
            value={uiMetaStr}
            onChange={(e) => { setUiMetaStr(e.target.value); setJsonError(null); }}
            className="font-mono text-xs min-h-[80px] resize-y"
            spellCheck={false}
            data-testid="textarea-new-ui-meta"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Route Config (JSON)</Label>
          <Textarea
            value={routeConfigStr}
            onChange={(e) => { setRouteConfigStr(e.target.value); setJsonError(null); }}
            className="font-mono text-xs min-h-[80px] resize-y"
            spellCheck={false}
            data-testid="textarea-new-route-config"
          />
        </div>

        {jsonError && (
          <p className="text-xs text-destructive" data-testid="new-module-json-error">{jsonError}</p>
        )}
      </div>

      <div className="flex items-center justify-end px-4 py-3 border-t border-border shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={onClose} data-testid="btn-cancel-new-module">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit}
          data-testid="btn-create-module"
        >
          {createMutation.isPending ? "Creating…" : "Create Module"}
        </Button>
      </div>
    </div>
  );
}
// 164:0
