import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackForm } from "@/components/FeedbackForm";

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "Share feedback — JobGenesis" },
      { name: "description", content: "Share feedback to help improve JobGenesis." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to dashboard
        </Link>
        <div className="mb-7 mt-7 rounded-3xl bg-gradient-to-br from-primary to-accent p-6 text-primary-foreground shadow-[var(--shadow-lift)] sm:p-9">
          <div className="flex items-center gap-2 text-sm font-medium text-primary-foreground/80">
            <Sparkles className="size-4" aria-hidden="true" />
            Your voice shapes JobGenesis
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            We’re listening.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-primary-foreground/85 sm:text-base">
            Tell us about your experience. Every note is reviewed by our team and helps us build a
            better product for candidates.
          </p>
        </div>
        <FeedbackForm />
      </main>
    </div>
  );
}
