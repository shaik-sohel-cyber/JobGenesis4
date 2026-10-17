import { unzipSync, strFromU8 } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";

export class ExtractionError extends Error {}

const MIN_CHARS = 120;

function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text);
}

function extractDocx(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new ExtractionError("The Word file does not contain readable document text.");
  const xml = strFromU8(doc);
  return xml
    .replace(/<w:tab[^>]*\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Extracts plain text from a PDF or DOCX resume. Throws ExtractionError on failure. */
export async function extractResumeText(bytes: Uint8Array, fileType: string): Promise<string> {
  let raw: string;
  try {
    raw = fileType === "pdf" ? await extractPdf(bytes) : extractDocx(bytes);
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    console.error("[resume] text extraction failed", error);
    throw new ExtractionError("We couldn't read the text inside this file.");
  }

  const text = normalise(raw);
  if (text.length < MIN_CHARS) {
    throw new ExtractionError(
      "We couldn't find enough readable text in this file. If it's a scanned document, try a text-based PDF or a Word file.",
    );
  }
  // Keep the payload sane for the model while covering long resumes.
  return text.slice(0, 60000);
}
