import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shield, Loader2, AlertCircle, CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLocation, Link } from "wouter";
import { useSEO } from "@/hooks/use-seo";

type Step = "email" | "challenge" | "passphrase" | "done";

interface ChallengeQuestion {
  id: number;
  question: string;
  sortOrder: number;
}

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

const challengeSchema = z.object({
  answer: z.string().min(1, "Answer is required"),
});

const passphraseSchema = z.object({
  newPassphrase: z
    .string()
    .min(16, "Passphrase must be at least 16 characters — try a full sentence"),
  confirm: z.string().min(1, "Please confirm your passphrase"),
}).refine((d) => d.newPassphrase === d.confirm, {
  message: "Passphrases do not match",
  path: ["confirm"],
});

type EmailForm = z.infer<typeof emailSchema>;
type ChallengeForm = z.infer<typeof challengeSchema>;
type PassphraseForm = z.infer<typeof passphraseSchema>;

export default function ResetPage() {
  useSEO({ title: "Reset Passphrase — a0p", description: "Recover access to your Agent Zero account." });
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ChallengeQuestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<ChallengeQuestion | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const challengeForm = useForm<ChallengeForm>({
    resolver: zodResolver(challengeSchema),
    defaultValues: { answer: "" },
  });

  const passphraseForm = useForm<PassphraseForm>({
    resolver: zodResolver(passphraseSchema),
    defaultValues: { newPassphrase: "", confirm: "" },
  });

  async function onEmailSubmit(values: EmailForm) {
    setError(null);
    try {
      const res = await fetch(
        `/api/auth/reset/questions?email=${encodeURIComponent(values.email)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "No account found with that email");
        return;
      }
      setUserId(data.userId);
      setQuestions(data.questions);
      setSelectedQuestion(data.questions[0] ?? null);
      setStep("challenge");
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  async function onChallengeSubmit(values: ChallengeForm) {
    if (!userId || !selectedQuestion) return;
    setError(null);
    try {
      const res = await fetch("/api/auth/reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId,
          challengeId: selectedQuestion.id,
          answer: values.answer,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Incorrect answer");
        return;
      }
      setResetToken(data.resetToken);
      setStep("passphrase");
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  async function onPassphraseSubmit(values: PassphraseForm) {
    if (!resetToken) return;
    setError(null);
    try {
      const res = await fetch("/api/auth/reset/passphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          resetToken,
          newPassphrase: values.newPassphrase,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Failed to reset passphrase");
        return;
      }
      setStep("done");
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  const newLen = passphraseForm.watch("newPassphrase")?.length ?? 0;
  const strengthPct = Math.min(100, (newLen / 40) * 100);
  const strengthColor =
    newLen === 0
      ? "bg-zinc-700"
      : newLen < 16
      ? "bg-red-500"
      : newLen < 24
      ? "bg-yellow-500"
      : "bg-emerald-500";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col" data-testid="reset-page">
      <div className="flex-1 flex flex-col items-center justify-start px-5 pt-10 pb-8 max-w-sm mx-auto w-full gap-6">
        <div className="text-center space-y-2 w-full">
          <div className="flex items-center justify-center gap-1.5">
            <Shield className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
              Agent Zero Platform
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter" data-testid="text-reset-title">
            {step === "done" ? "Passphrase Reset" : "Recover Access"}
          </h1>
        </div>

        {error && (
          <div
            className="w-full flex items-center gap-2 text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2"
            data-testid="text-reset-error"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {step === "email" && (
          <div className="w-full space-y-4">
            <p className="text-xs text-zinc-500 leading-relaxed">
              Enter your email address. If you set up recovery questions, you'll be prompted to answer one.
            </p>
            <Form {...emailForm}>
              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-400 text-xs">Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                          data-testid="input-reset-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={emailForm.formState.isSubmitting}
                  data-testid="button-find-account"
                >
                  {emailForm.formState.isSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Looking up account…</>
                  ) : (
                    <>Find My Account <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </form>
            </Form>
          </div>
        )}

        {step === "challenge" && questions.length > 0 && selectedQuestion && (
          <div className="w-full space-y-4">
            <button
              onClick={() => { setStep("email"); setError(null); challengeForm.reset(); }}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              data-testid="button-back-to-email"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Change email
            </button>

            {questions.length > 1 && (
              <div className="space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Select a question</p>
                {questions.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => { setSelectedQuestion(q); challengeForm.reset(); setError(null); }}
                    className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                      selectedQuestion.id === q.id
                        ? "border-primary text-primary bg-primary/10"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
                    }`}
                    data-testid={`button-select-question-${q.id}`}
                  >
                    {q.question}
                  </button>
                ))}
              </div>
            )}

            <Form {...challengeForm}>
              <form onSubmit={challengeForm.handleSubmit(onChallengeSubmit)} className="space-y-4">
                <FormField
                  control={challengeForm.control}
                  name="answer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-400 text-xs">{selectedQuestion.question}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Your answer…"
                          className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                          data-testid="input-challenge-answer"
                          autoFocus
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={challengeForm.formState.isSubmitting}
                  data-testid="button-verify-answer"
                >
                  {challengeForm.formState.isSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verifying…</>
                  ) : (
                    <>Verify Answer <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </form>
            </Form>
          </div>
        )}

        {step === "passphrase" && (
          <div className="w-full space-y-4">
            <p className="text-xs text-zinc-500 leading-relaxed">
              Answer verified. Set your new passphrase — use a memorable full sentence.
            </p>
            <Form {...passphraseForm}>
              <form onSubmit={passphraseForm.handleSubmit(onPassphraseSubmit)} className="space-y-4">
                <FormField
                  control={passphraseForm.control}
                  name="newPassphrase"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-400 text-xs flex items-center justify-between">
                        <span>New passphrase</span>
                        <span className={`tabular-nums text-[10px] ${newLen < 16 ? "text-red-400" : "text-emerald-400"}`}>
                          {newLen} chars {newLen < 16 ? `(need ${16 - newLen} more)` : "✓"}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="A memorable sentence with spaces…"
                          autoComplete="new-password"
                          className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                          data-testid="input-new-passphrase"
                          {...field}
                        />
                      </FormControl>
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full transition-all ${strengthColor}`}
                          style={{ width: `${strengthPct}%` }}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passphraseForm.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-400 text-xs">Confirm passphrase</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Repeat your passphrase"
                          autoComplete="new-password"
                          className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                          data-testid="input-confirm-passphrase"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={passphraseForm.formState.isSubmitting}
                  data-testid="button-set-passphrase"
                >
                  {passphraseForm.formState.isSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</>
                  ) : (
                    <>Set New Passphrase <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </form>
            </Form>
          </div>
        )}

        {step === "done" && (
          <div className="w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-emerald-400" data-testid="text-reset-success">
                Passphrase updated successfully
              </p>
              <p className="text-xs text-zinc-500">
                You can now sign in with your new passphrase.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => setLocation("/login")}
              data-testid="button-go-to-login"
            >
              Sign In →
            </Button>
          </div>
        )}

        <p className="text-[11px] text-zinc-600">
          <Link href="/login" className="text-zinc-500 hover:text-zinc-300 transition-colors" data-testid="link-back-to-login">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
