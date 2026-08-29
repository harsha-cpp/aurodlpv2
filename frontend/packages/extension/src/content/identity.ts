const EMAIL_IN_PARENS = /\(([^()\s]+@[^()\s]+)\)/;
const BARE_EMAIL = /[^\s<>()[\],;:"]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i;

export function extractUserEmail(
  doc: Document,
  compose?: Element | null,
): string | undefined {
  for (const candidate of candidates(doc, compose)) {
    const email = normalizeEmail(candidate);
    if (email) return email;
  }
  return undefined;
}

function* candidates(
  doc: Document,
  compose?: Element | null,
): Generator<string | null | undefined> {
  if (compose) {
    yield compose.querySelector<HTMLInputElement>('input[name="from"]')?.value;
    const fromRow = compose.querySelector('[aria-label*="From" i]');
    yield fromRow?.getAttribute("email") ?? fromRow?.textContent;
  }

  const accountSelectors = [
    'a[href*="SignOutOptions"][aria-label]',
    'a[href*="accounts.google.com"][aria-label]',
    '[aria-label*="Google Account" i]',
    'header [aria-label*="@" i]',
    'img[alt*="@" i]',
  ];
  for (const selector of accountSelectors) {
    for (const el of doc.querySelectorAll(selector)) {
      yield el.getAttribute("aria-label") ?? el.getAttribute("alt");
    }
  }

  yield doc.title;
}

function normalizeEmail(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  const parenthesised = EMAIL_IN_PARENS.exec(value)?.[1];
  const bare = parenthesised ?? BARE_EMAIL.exec(value)?.[0];
  if (!bare) return undefined;
  const email = bare.trim().toLowerCase();
  if (email === "unknown" || email.startsWith("unknown@")) return undefined;
  return email;
}
