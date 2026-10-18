import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, LoaderCircle, MessageSquareHeart, Star } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { submitFeedback } from "@/lib/feedback.functions";

const features = [
  ["resume_analysis", "Resume Analysis"],
  ["ai_interview", "AI Interview"],
  ["interview_report", "Interview Report"],
  ["other", "Other"],
] as const;

const categories = [
  ["general", "General Feedback"],
  ["bug", "Bug Report"],
  ["feature_request", "Feature Request"],
  ["performance_voice", "Performance / Voice Issue"],
] as const;

type Feature = (typeof features)[number][0];
type Category = (typeof categories)[number][0];

const controlClass =
  "mt-2 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

export function FeedbackForm() {
  const sendFeedback = useServerFn(submitFeedback);
  const { user } = useSession();
  const [rating, setRating] = useState(0);
  const [feature, setFeature] = useState<Feature | "">("");
  const [category, setCategory] = useState<Category | "">("");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (rating < 1 || !feature || !category) {
      setError("Choose a rating, feature, and feedback category to continue.");
      return;
    }
    if (message.trim().length < 10) {
      setError("Please add a little more detail (at least 10 characters).");
      return;
    }

    setBusy(true);
    try {
      const result = await sendFeedback({
        data: {
          rating,
          feature,
          category,
          message: message.trim(),
          contactEmail: contactEmail.trim(),
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSubmitted(true);
      setMessage("");
    } catch (cause) {
      console.error("[feedback] request failed", cause);
      setError("We couldn't submit your feedback right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <section className="rounded-3xl border border-border bg-card p-7 text-center shadow-[var(--shadow-card)] sm:p-10">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success/10 text-success">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-semibold">
          Thank you for helping us improve.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Your feedback has been saved. For direct support, email{" "}
          <a
            className="font-medium text-primary hover:underline"
            href="mailto:jobgenesisai@gmail.com"
          >
            jobgenesisai@gmail.com
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setRating(0);
            setFeature("");
            setCategory("");
            setMessage("");
          }}
          className="mt-6 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-secondary"
        >
          Send more feedback
        </button>
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-8"
    >
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MessageSquareHeart className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Tell us what you think</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Your feedback goes directly to the JobGenesis team and helps us make the experience
            better.
          </p>
        </div>
      </div>

      <div className="mt-7">
        <span id="feedback-rating-label" className="text-sm font-medium">
          Overall rating <span className="text-destructive">*</span>
        </span>
        <div className="mt-2 flex gap-1" role="group" aria-labelledby="feedback-rating-label">
          {Array.from({ length: 5 }, (_, index) => {
            const value = index + 1;
            return (
              <button
                key={value}
                type="button"
                aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
                className="rounded-lg p-2 text-amber-400 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star
                  className={`size-7 ${rating >= value ? "fill-current" : ""}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
          <span className="self-center pl-2 text-sm text-muted-foreground">
            {rating ? `${rating} out of 5` : "Select a rating"}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Which feature is this about? <span className="text-destructive">*</span>
          <select
            required
            value={feature}
            onChange={(event) => setFeature(event.target.value as Feature)}
            className={controlClass}
          >
            <option value="" disabled>
              Select a feature
            </option>
            {features.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Feedback category <span className="text-destructive">*</span>
          <select
            required
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            className={controlClass}
          >
            <option value="" disabled>
              Select a category
            </option>
            {categories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-5 block text-sm font-medium">
        Your feedback <span className="text-destructive">*</span>
        <textarea
          required
          minLength={10}
          maxLength={3000}
          rows={6}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="What worked well? What could be smoother?"
          className={`${controlClass} min-h-36 resize-y`}
        />
        <span className="mt-1 block text-right text-xs font-normal text-muted-foreground">
          {message.length}/3000
        </span>
      </label>

      <label className="mt-4 block text-sm font-medium">
        Contact email <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          type="email"
          maxLength={254}
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          placeholder="you@example.com"
          className={controlClass}
        />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Only included if you’d like us to follow up about your feedback.
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {busy ? "Sending feedback…" : "Send feedback"}
      </button>
    </form>
  );
}
