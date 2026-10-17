import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { formatBytes } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/resume/upload")({
  head: () => ({
    meta: [
      { title: "Upload your resume — JobGenesis" },
      { name: "description", content: "Upload a PDF or Word resume for analysis." },
      { property: "og:title", content: "Upload your resume — JobGenesis" },
      { property: "og:description", content: "Upload a PDF or Word resume for analysis." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UploadPage,
});

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED: Record<string, "pdf" | "docx"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function detectType(file: File): "pdf" | "docx" | null {
  const byMime = ACCEPTED[file.type];
  if (byMime) return byMime;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  function pick(next: File | null) {
    setError(null);
    if (!next) return;
    if (!detectType(next)) {
      setError("That file type isn't supported. Please upload a PDF or a Word (.docx) file.");
      setFile(null);
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(`That file is ${formatBytes(next.size)}. The limit is 10 MB.`);
      setFile(null);
      return;
    }
    if (next.size === 0) {
      setError("That file appears to be empty.");
      setFile(null);
      return;
    }
    setFile(next);
  }

  async function upload() {
    if (!file) return;
    const fileType = detectType(file);
    if (!fileType) return;

    setError(null);
    setProgress(0);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        setError("Your session expired. Please log in again.");
        setProgress(null);
        return;
      }

      const resumeId = crypto.randomUUID();
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
      const path = `${session.user.id}/${resumeId}/${safeName}`;

      await uploadWithProgress(file, path, session.access_token, setProgress);

      const { error: insertError } = await supabase.from("resumes").insert({
        id: resumeId,
        user_id: session.user.id,
        file_name: file.name,
        file_path: path,
        file_type: fileType,
        file_size: file.size,
        status: "uploaded",
      });
      if (insertError) throw insertError;

      navigate({ to: "/resume/$id", params: { id: resumeId } });
    } catch (err) {
      console.error(err);
      setProgress(null);
      setError("We couldn't upload your resume. Please check your connection and try again.");
    }
  }

  const busy = progress !== null;

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold">Upload your resume</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          PDF or Word (.docx), up to 10&nbsp;MB. Your file is stored privately and only you can
          access it.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`mt-8 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-accent bg-accent/5" : "border-border bg-card"
          }`}
        >
          <p className="font-display text-base font-semibold">Drag and drop your resume here</p>
          <p className="mt-1 text-sm text-muted-foreground">or</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-3 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
          >
            Browse files
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>

        {file ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
            {!busy ? (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-sm text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            ) : null}
          </div>
        ) : null}

        {busy ? (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Uploading…</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={upload}
          disabled={!file || busy}
          className="mt-7 w-full rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload and analyze"}
        </button>
      </main>
    </div>
  );
}

function uploadWithProgress(
  file: File,
  path: string,
  accessToken: string,
  onProgress: (value: number) => void,
): Promise<void> {
  const baseUrl = import.meta.env["VITE_SUPABASE_URL"] as string;
  const apiKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl}/storage/v1/object/resumes/${encodeURI(path)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", apiKey);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}
