import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, Lock, ScrollText, Settings } from "lucide-react";

export function ExportTab() {
  const { toast } = useToast();
  const [transcriptFrom, setTranscriptFrom] = useState("");
  const [transcriptTo, setTranscriptTo] = useState("");
  const [transcriptModel, setTranscriptModel] = useState("all");
  const [transcriptFormat, setTranscriptFormat] = useState("jsonl");
  const [convId, setConvId] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: conversations = [] } = useQuery<any[]>({ queryKey: ["/api/v1/conversations"] });
  const { data: aiFiles = [] } = useQuery<any[]>({ queryKey: ["/api/v1/ai-transcripts/files"] });

  function triggerDownload(url: string, filename: string, key: string) {
    setDownloading(key);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => setDownloading(null), 1500);
    toast({ title: `Downloading ${filename}` });
  }

  function downloadTranscripts() {
    const params = new URLSearchParams();
    if (transcriptFrom) params.set("from", transcriptFrom);
    if (transcriptTo) params.set("to", transcriptTo);
    if (transcriptModel && transcriptModel !== "all") params.set("model", transcriptModel);
    params.set("format", transcriptFormat);
    triggerDownload(`/api/export/transcripts?${params}`, `ai-transcripts.${transcriptFormat === "json" ? "json" : "jsonl"}`, "transcripts");
  }
  function downloadConversations() {
    const params = new URLSearchParams();
    if (convId) params.set("id", convId);
    triggerDownload(`/api/export/conversations?${params}`, convId ? `conversation-${convId}.json` : "conversations.json", "conversations");
  }
  function downloadCredentials() { triggerDownload("/api/export/credentials", "credentials-inventory.json", "credentials"); }
  function downloadConfig() { triggerDownload("/api/export/config", "system-config.json", "config"); }
  function downloadAll() { triggerDownload("/api/export/all", "a0p-export.zip", "all"); }

  const totalTranscriptSize = aiFiles.reduce((s: number, f: any) => s + (f.size || 0), 0);

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Download className="w-4 h-4 text-primary" /> Data Export</h3>
          <Button onClick={downloadAll} disabled={downloading === "all"} data-testid="button-download-all"><Download className="w-4 h-4 mr-1" />{downloading === "all" ? "Preparing..." : "Download All (ZIP)"}</Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2"><ScrollText className="w-4 h-4 text-blue-400" /> AI Transcripts</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {aiFiles.length} file{aiFiles.length !== 1 ? "s" : ""} ({totalTranscriptSize > 1024 ? `${(totalTranscriptSize / 1024).toFixed(1)} KB` : `${totalTranscriptSize} B`})
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTranscripts} disabled={downloading === "transcripts"} data-testid="button-download-transcripts"><Download className="w-3 h-3 mr-1" />{downloading === "transcripts" ? "..." : "Download"}</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px] text-muted-foreground">From</Label><Input type="date" value={transcriptFrom} onChange={e => setTranscriptFrom(e.target.value)} data-testid="input-transcript-from" /></div>
            <div><Label className="text-[10px] text-muted-foreground">To</Label><Input type="date" value={transcriptTo} onChange={e => setTranscriptTo(e.target.value)} data-testid="input-transcript-to" /></div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Model</Label>
              <Select value={transcriptModel} onValueChange={setTranscriptModel}>
                <SelectTrigger data-testid="select-transcript-model"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="grok">Grok</SelectItem>
                  <SelectItem value="synthesis-merge">Synthesis Merge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Format</Label>
              <Select value={transcriptFormat} onValueChange={setTranscriptFormat}>
                <SelectTrigger data-testid="select-transcript-format"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jsonl">JSONL</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-green-400" /> Chat Conversations</h4>
              <p className="text-xs text-muted-foreground mt-0.5">{conversations.length} conversation{conversations.length !== 1 ? "s" : ""}</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadConversations} disabled={downloading === "conversations"} data-testid="button-download-conversations"><Download className="w-3 h-3 mr-1" />{downloading === "conversations" ? "..." : "Download"}</Button>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Conversation (leave empty for all)</Label>
            <Select value={convId || "all"} onValueChange={v => setConvId(v === "all" ? "" : v)}>
              <SelectTrigger data-testid="select-conversation-id"><SelectValue placeholder="All conversations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Conversations</SelectItem>
                {conversations.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>#{c.id} - {c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div><h4 className="font-semibold text-sm flex items-center gap-2"><Lock className="w-4 h-4 text-amber-400" /> Credentials Inventory</h4><p className="text-xs text-muted-foreground mt-0.5">Names, categories, and field labels only (no secret values)</p></div>
            <Button variant="outline" size="sm" onClick={downloadCredentials} disabled={downloading === "credentials"} data-testid="button-download-credentials"><Download className="w-3 h-3 mr-1" />{downloading === "credentials" ? "..." : "Download"}</Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div><h4 className="font-semibold text-sm flex items-center gap-2"><Settings className="w-4 h-4 text-purple-400" /> System Configuration</h4><p className="text-xs text-muted-foreground mt-0.5">Toggles, bandit arms, EDCM, memory seeds, heartbeat, costs</p></div>
            <Button variant="outline" size="sm" onClick={downloadConfig} disabled={downloading === "config"} data-testid="button-download-config"><Download className="w-3 h-3 mr-1" />{downloading === "config" ? "..." : "Download"}</Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
