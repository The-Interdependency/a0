// 319:0
import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shield, Send, Loader2, AlertCircle, MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { useSEO } from "@/hooks/use-seo";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  passphrase: z.string().min(1, "Passphrase is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

interface GuestMessage {
  role: "user" | "assistant";
  content: string;
}

function GuestChat() {
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/guest/status", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setTokenStatus({ used: d.tokensUsed, limit: d.tokensLimit, remaining: d.tokensRemaining });
        if (d.tokensRemaining <= 0) setLimitReached(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading || limitReached) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/guest/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setLimitReached(true);
        setTokenStatus({ used: data.tokensLimit, limit: data.tokensLimit, remaining: 0 });
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "You've reached the hourly token limit for guest access. Sign in or come back next hour.",
          },
        ]);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.content }]);
      setTokenStatus({
        used: data.tokensUsed,
        limit: data.tokensLimit,
        remaining: data.tokensRemaining,
      });
      if (data.tokensRemaining <= 0) setLimitReached(true);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const pct = tokenStatus ? Math.min(100, (tokenStatus.used / tokenStatus.limit) * 100) : 0;

  return (
    <div
      className="w-full border border-zinc-800 rounded-xl bg-zinc-950 overflow-hidden"
      data-testid="guest-chat-widget"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <MessageSquare className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium text-zinc-300">Try A0 — no account needed</span>
        {tokenStatus && (
          <span
            className="ml-auto text-[10px] text-zinc-500 tabular-nums"
            data-testid="text-tokens-remaining"
          >
            {tokenStatus.remaining} / {tokenStatus.limit} tokens left
          </span>
        )}
      </div>

      {tokenStatus && (
        <div className="h-0.5 bg-zinc-800">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div
        className="h-48 overflow-y-auto px-4 py-3 space-y-3"
        data-testid="guest-chat-messages"
      >
        {messages.length === 0 && (
          <p className="text-zinc-600 text-xs text-center mt-12">
            Ask me anything — limited preview of A0.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={`inline-block px-3 py-1.5 rounded-lg text-xs max-w-[90%] leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-zinc-800 text-zinc-200"
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {loading && (
          <div className="text-left">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs">
              <Loader2 className="w-3 h-3 animate-spin" />
              thinking…
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-800 p-3 flex gap-2">
        <input
          className="flex-1 bg-zinc-900 text-zinc-100 text-xs px-3 py-2 rounded-lg border border-zinc-700 focus:outline-none focus:border-primary placeholder:text-zinc-600 disabled:opacity-40"
          placeholder={
            limitReached
              ? "Token limit reached — sign in for full access"
              : "Message A0…"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          disabled={loading || limitReached}
          maxLength={500}
          data-testid="input-guest-message"
        />
        <Button
          size="sm"
          onClick={send}
          disabled={loading || limitReached || !input.trim()}
          className="shrink-0 h-8 w-8 p-0"
          data-testid="button-guest-send"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  useSEO({ title: "Sign In — a0p", description: "Sign in to Agent Zero Platform." });
  const { isAuthenticated, isLoading, loginAsync } = useAuth();
  const [, setLocation] = useLocation();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) setLocation("/");
  }, [isAuthenticated, setLocation]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", passphrase: "" },
  });

  async function onSubmit(values: LoginForm) {
    setAuthError(null);
    try {
      await loginAsync({ username: values.username, passphrase: values.passphrase });
      setLocation("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("401")) {
        setAuthError("Invalid username or passphrase.");
      } else {
        setAuthError("Something went wrong. Please try again.");
      }
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col" data-testid="login-page">
      <div className="flex-1 flex flex-col items-center justify-start px-5 pt-12 pb-8 max-w-sm mx-auto w-full gap-8">
        <div className="text-center space-y-2 w-full">
          <h1 className="text-4xl font-black tracking-tighter" data-testid="text-login-title">
            Agent Zero
          </h1>
          <div className="flex items-center justify-center gap-1.5">
            <Shield className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
              Autonomous AI Platform
            </span>
          </div>
        </div>

        <div className="w-full space-y-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-zinc-400 text-xs">Username</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="your username"
                        autoComplete="username"
                        className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-primary"
                        data-testid="input-username"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="passphrase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-zinc-400 text-xs">Passphrase</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Your passphrase sentence…"
                        autoComplete="current-password"
                        className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-primary"
                        data-testid="input-passphrase"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-[10px] text-zinc-600 italic leading-relaxed">
                      e.g. "The blue lighthouse blinks at midnight" · "Rainy Sundays in late October are cozy"
                    </p>
                  </FormItem>
                )}
              />

              {authError && (
                <div
                  className="flex items-center gap-2 text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2"
                  data-testid="text-auth-error"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {authError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
                data-testid="button-sign-in"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="flex items-center justify-between text-[11px]">
            <Link
              href="/reset"
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              data-testid="link-forgot-passphrase"
            >
              Forgot passphrase?
            </Link>
            <Link
              href="/register"
              className="text-primary hover:text-primary/80 transition-colors"
              data-testid="link-register"
            >
              Request access →
            </Link>
          </div>
        </div>

        <div className="w-full">
          <GuestChat />
        </div>
      </div>

      <div className="text-center pb-5 px-4">
        <p className="text-[10px] text-zinc-800">a0p · TIW Canon · EDCMBONE</p>
      </div>
    </div>
  );
}
// 319:0
