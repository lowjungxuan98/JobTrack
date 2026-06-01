// Render cover-letter JSON into HTML.
import { h, textBlock } from "./cv-html";
import { recordOf, s, strList } from "./values";

function contactItems(contact: Record<string, unknown>): string {
  return [
    s(contact.email),
    s(contact.phone),
    s(contact.linkedin_display),
    s(contact.location),
  ]
    .filter(Boolean)
    .map(h)
    .join(" | ");
}

export function normalizeLetter(
  ready: Record<string, unknown>,
  llm: Record<string, unknown>,
  today: string,
): Record<string, unknown> {
  const metadata = recordOf(ready.metadata);
  const contact = recordOf(ready.contact);
  const letter = recordOf(llm.letter);
  const paperFormat = s(metadata.paper_format).toLowerCase();
  return {
    metadata: {
      company: s(metadata.company),
      job_title: s(metadata.job_title),
      job_url: s(metadata.job_url),
      job_location: s(metadata.job_location),
      language: "en",
      paper_format: paperFormat === "a4" || paperFormat === "letter" ? paperFormat : "a4",
    },
    contact,
    letter: {
      date: s(letter.date) || today,
      recipient: s(letter.recipient) || "Hiring Team",
      greeting: s(letter.greeting) || "Dear Hiring Team,",
      paragraphs: strList(letter.paragraphs),
      closing: s(letter.closing) || "Sincerely,",
      signature: s(letter.signature) || s(contact.name),
    },
  };
}

export function renderCoverLetter(
  data: Record<string, unknown>,
  template: string,
): string {
  const metadata = recordOf(data.metadata);
  const contact = recordOf(data.contact);
  const letter = recordOf(data.letter);
  const paperFormat = s(metadata.paper_format).toLowerCase();
  const paragraphs = strList(letter.paragraphs).map((p) => `<p>${textBlock(p)}</p>`).join("\n");
  const replacements: Record<string, string> = {
    LANG: "en",
    PAGE_CLASS: paperFormat === "letter" ? "page-letter" : "page-a4",
    NAME: h(contact.name || "Candidate"),
    CONTACT_ROW: contactItems(contact),
    DATE: h(letter.date),
    RECIPIENT: h(letter.recipient),
    COMPANY: h(metadata.company),
    JOB_TITLE: h(metadata.job_title),
    GREETING: h(letter.greeting),
    PARAGRAPHS: paragraphs,
    CLOSING: h(letter.closing),
    SIGNATURE: h(letter.signature),
  };
  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  const unresolved = Object.keys(replacements).filter((token) => html.includes(`{{${token}}}`));
  if (unresolved.length) {
    throw new Error(`unresolved template placeholders: ${unresolved.join(", ")}`);
  }
  return html;
}
