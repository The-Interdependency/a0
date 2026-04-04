import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shield, Loader2, AlertCircle, Plus, Trash2, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { useSEO } from "@/hooks/use-seo";

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(40, "Username must be 40 characters or less")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Only letters, numbers, underscores, dots and hyphens"),
  email: z.string().email("Enter a valid email address"),
  passphrase: z
    .string()
    .min(16, "Passphrase must be at least 16 characters — try a full sentence"),
  displayName: z.string().optional(),
  challenges: z
    .array(
      z.object({
        question: z.string().min(5, "Question must be at least 5 characters"),
        answer: z.string().min(2, "Answer must be at least 2 characters"),
      })
    )
    .optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  useSEO({ title: "Register — a0p", description: "Create your Agent Zero Platform account." });
  const { loginAsync } = useAuth();
  const [, setLocation] = useLocation();
  const [authError, setAuthError] = useState<string | null>(null);
  const [showChallenges, setShowChallenges] = useState(false);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      passphrase: "",
      displayName: "",
      challenges: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "challenges",
  });

  const passphrase = form.watch("passphrase");
  const passLen = passphrase?.length ?? 0;

  async function onSubmit(values: RegisterForm) {
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: values.username,
          email: values.email,
          passphrase: values.passphrase,
          displayName: values.displayName || values.username,
          challenges: values.challenges?.filter((c) => c.question && c.answer) ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.message ?? "Registration failed");
        return;
      }
      setLocation("/");
    } catch {
      setAuthError("Something went wrong. Please try again.");
    }
  }

  const strengthPct = Math.min(100, (passLen / 40) * 100);
  const strengthColor =
    passLen === 0
      ? "bg-zinc-700"
      : passLen < 16
      ? "bg-red-500"
      : passLen < 24
      ? "bg-yellow-500"
      : "bg-emerald-500";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col" data-testid="register-page">
      <div className="flex-1 flex flex-col items-center justify-start px-5 pt-10 pb-8 max-w-sm mx-auto w-full gap-6">
        <div className="text-center space-y-2 w-full">
          <div className="flex items-center justify-center gap-1.5">
            <Shield className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
              Agent Zero Platform
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter" data-testid="text-register-title">
            Create Account
          </h1>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-zinc-400 text-xs">Username</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="yourname"
                      autoComplete="username"
                      className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-zinc-400 text-xs">Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                      data-testid="input-email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-zinc-400 text-xs">Display name <span className="text-zinc-600">(optional)</span></FormLabel>
                  <FormControl>
                    <Input
                      placeholder="How A0 addresses you"
                      className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                      data-testid="input-display-name"
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
                  <FormLabel className="text-zinc-400 text-xs flex items-center justify-between">
                    <span>Passphrase</span>
                    <span
                      className={`tabular-nums ${passLen < 16 ? "text-red-400" : "text-emerald-400"}`}
                      data-testid="text-passphrase-length"
                    >
                      {passLen} chars {passLen < 16 ? `(need ${16 - passLen} more)` : "✓"}
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="A memorable sentence with spaces…"
                      autoComplete="new-password"
                      className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                      data-testid="input-passphrase"
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
                  <p className="text-[10px] text-zinc-600 italic leading-relaxed">
                    Must be ≥ 16 characters. Use a full sentence — spaces are allowed and encouraged.
                    <br />
                    e.g. "The blue lighthouse blinks at midnight" · "I love quiet mornings before the city wakes"
                  </p>
                </FormItem>
              )}
            />

            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowChallenges((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                data-testid="button-toggle-challenges"
              >
                <span>Recovery questions <span className="text-zinc-600">(optional, up to 3)</span></span>
                {showChallenges ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showChallenges && (
                <div className="border-t border-zinc-800 p-4 space-y-4">
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Write your own questions and answers. These let you recover your passphrase without email. Answers are stored encrypted.
                  </p>

                  {fields.map((field, index) => (
                    <div key={field.id} className="space-y-2 border border-zinc-800 rounded-lg p-3 relative">
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 transition-colors"
                        data-testid={`button-remove-challenge-${index}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <FormField
                        control={form.control}
                        name={`challenges.${index}.question`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-zinc-500 text-[10px]">Your question</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. The name of my first pet"
                                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 text-xs h-8"
                                data-testid={`input-challenge-question-${index}`}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`challenges.${index}.answer`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-zinc-500 text-[10px]">Your answer</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Your answer (stored encrypted)"
                                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 text-xs h-8"
                                data-testid={`input-challenge-answer-${index}`}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}

                  {fields.length < 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ question: "", answer: "" })}
                      className="w-full border-zinc-700 text-zinc-400 hover:text-white text-xs h-8"
                      data-testid="button-add-challenge"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Add question
                    </Button>
                  )}
                </div>
              )}
            </div>

            {authError && (
              <div
                className="flex items-center gap-2 text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2"
                data-testid="text-register-error"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {authError}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
              data-testid="button-register"
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating account…
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </Form>

        <p className="text-[11px] text-zinc-600">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:text-primary/80" data-testid="link-sign-in">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
