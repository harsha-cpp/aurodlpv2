// Who is sending.
//
// This was a single regex over one aria-label, defaulting to the literal string
// 'unknown' when Gmail's markup differed. Every audit row written from such a
// send named a user that does not exist, which is worse than an empty column:
// it looks like real attribution. Several selectors are tried now, and a
// failure returns undefined so the backend can record the gap honestly.
//
// This is still scraped identity and can be wrong or absent. Per-device
// enrollment tokens are the real fix; this only has to stop lying in the
// meantime.

const EMAIL_IN_PARENS = /\(([^()\s]+@[^()\s]+)\)/;
const BARE_EMAIL = /[^\s<>()[\],;:"]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i;

/**
 * Best-effort sender address for the active Gmail account.
 *
 * @param compose the compose being sent, used for the explicit "From" control
 *                when the account has send-as aliases.
 */
export function extractUserEmail(doc: Document, compose?: Element | null): string | undefined {
  for (const candidate of candidates(doc, compose)) {
    const email = normalizeEmail(candidate);
    if (email) return email;
  }
  return undefined;
}

function* candidates(doc: Document, compose?: Element | null): Generator<string | null | undefined> {
  // 1. An explicit send-as alias on the draft wins over the account identity.
  if (compose) {
    yield compose.querySelector<HTMLInputElement>('input[name="from"]')?.value;
    const fromRow = compose.querySelector('[aria-label*="From" i]');
    yield fromRow?.getAttribute('email') ?? fromRow?.textContent;
  }

  // 2. The account switcher / sign-out link, in the several shapes Gmail ships.
  const accountSelectors = [
    'a[href*="SignOutOptions"][aria-label]',
    'a[href*="accounts.google.com"][aria-label]',
    '[aria-label*="Google Account" i]',
    'header [aria-label*="@" i]',
    'img[alt*="@" i]',
  ];
  for (const selector of accountSelectors) {
    for (const el of doc.querySelectorAll(selector)) {
      yield el.getAttribute('aria-label') ?? el.getAttribute('alt');
    }
  }

  // 3. Gmail keeps the mailbox address in the document title.
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
  // Guard against scraping a placeholder back into the audit trail.
  if (email === 'unknown' || email.startsWith('unknown@')) return undefined;
  return email;
}
