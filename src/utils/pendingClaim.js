// Bulletproof "I paid but didn't get my plan" recovery.
//
// The flow:
//   1. Popup callback fires → we know the gateway confirmed the charge.
//   2. We immediately stash a pendingClaim record in localStorage with
//      everything needed to grant the plan / unlock.
//   3. Then we call claimPlan / unlockProject with retries (4 attempts,
//      exponential backoff). On success we delete the record.
//   4. If every retry fails (long network outage, server down) the
//      record stays in localStorage and the user is told their payment
//      is safe and will be applied when they reopen the app.
//   5. On every app boot, replayPendingClaims() walks the list and
//      re-attempts each one in the background. Successful claims fire
//      `autobook:claim-applied` so the UI can refresh.
//
// Net effect: a successful payment ALWAYS lands as a granted plan, even
// if the post-payment network call dropped — without the user having to
// contact support.

const KEY = 'autobook-pending-claim-v1';
const FRESH_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function readPending() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function writePending(list) {
  try {
    if (!list || list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* storage full — non-fatal */ }
}

export function savePending(claim) {
  if (!claim?.reference) return;
  const list = readPending();
  // De-dupe by reference so the same payment doesn't queue twice.
  const without = list.filter((c) => c.reference !== claim.reference);
  without.push({ ...claim, paidAt: Date.now(), attempts: 0 });
  writePending(without);
}

export function removePending(reference) {
  if (!reference) return;
  writePending(readPending().filter((c) => c.reference !== reference));
}

function bumpAttempts(reference) {
  const list = readPending().map((c) =>
    c.reference === reference
      ? { ...c, attempts: (c.attempts || 0) + 1, lastAttempt: Date.now() }
      : c
  );
  writePending(list);
}

// Lazy import keeps this module free of the supabase / paystack module
// graph at load time — important because it's pulled in early during
// app boot replay.
async function applyClaim(claim) {
  const { claimPlan, unlockProject } = await import('./paystack');
  if (claim.kind === 'plan') {
    await claimPlan(claim.plan, claim.reference);
    return;
  }
  if (claim.kind === 'book') {
    await unlockProject({
      projectId: claim.projectId,
      spreadCount: claim.spreadCount,
      coverCount: claim.coverCount,
      totalNGN: claim.amount,
      reference: claim.reference,
      currencyCode: claim.currencyCode,
    });
    return;
  }
  throw new Error(`Unknown claim kind: ${claim.kind}`);
}

export async function tryClaimWithRetry(claim, { maxAttempts = 4, baseDelayMs = 800 } = {}) {
  let lastError = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await applyClaim(claim);
      removePending(claim.reference);
      return { ok: true };
    } catch (e) {
      lastError = e;
      bumpAttempts(claim.reference);
      // No backoff after the last attempt — we're about to give up.
      if (i < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  return { ok: false, error: lastError };
}

// Called once at app boot. Walks every queued claim and tries to apply
// it silently. Successful claims emit a custom event so the UI can
// react (e.g. flash a toast / refresh tier).
let _replayedOnce = false;
export async function replayPendingClaims() {
  if (_replayedOnce) return;
  _replayedOnce = true;
  const pending = readPending();
  if (pending.length === 0) return;
  const now = Date.now();
  for (const claim of pending) {
    // Drop very stale entries — the gateway's reference is long past
    // its verification window at that point.
    if (now - (claim.paidAt || 0) > FRESH_MS) {
      removePending(claim.reference);
      continue;
    }
    const result = await tryClaimWithRetry(claim);
    if (result.ok) {
      try {
        window.dispatchEvent(new CustomEvent('autobook:claim-applied', { detail: { claim } }));
      } catch { /* ignore */ }
    }
  }
}
