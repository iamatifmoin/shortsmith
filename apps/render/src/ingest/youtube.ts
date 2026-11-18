/**
 * Best-effort YouTube license check (ADR-024). We NEVER download the video — we
 * only read the watch page to see whether it's marked Creative Commons, as a
 * provenance signal. It is advisory, never authoritative: the operator verifies.
 */
export interface YouTubeLicense {
  url: string;
  /** true = CC/reuse-allowed detected, false = Standard License, null = unknown. */
  reuseAllowed: boolean | null;
  label: string;
}

export async function checkYouTubeLicense(url: string): Promise<YouTubeLicense> {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return unknown(url, `fetch ${res.status}`);
    const html = await res.text();

    if (/Creative Commons Attribution license/i.test(html) || /"license":"Creative Commons/i.test(html)) {
      return { url, reuseAllowed: true, label: 'Creative Commons (reuse allowed) — verify' };
    }
    if (/Standard YouTube License/i.test(html)) {
      return {
        url,
        reuseAllowed: false,
        label: 'Standard YouTube License (NOT reuse-allowed) — do not use unless it is your own capture',
      };
    }
    return unknown(url, 'license not found in page');
  } catch (err) {
    return unknown(url, `check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function unknown(url: string, why: string): YouTubeLicense {
  return { url, reuseAllowed: null, label: `license not auto-verified (${why}) — verify manually` };
}
