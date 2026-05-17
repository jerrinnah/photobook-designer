# Paystack Setup — AutoBook by NEJ

The Premium upgrade button uses **Paystack inline popup** for payment.
Once a charge completes, the frontend calls a Supabase RPC that records
the payment and flips the user to `tier = 'premium'` immediately.

This guide walks through the manual steps.

---

## 1. Create your Paystack account

1. Sign up at https://paystack.com.
2. Go to **Settings → API Keys & Webhooks**.
3. Copy the **Test public key** (`pk_test_...`) for now. Use Live when
   you're ready to take real money.

> The **Secret key** (`sk_test_...`) is for server-side verification only.
> NEVER put it in `.env.production` or the frontend bundle.

---

## 2. Run the Supabase SQL

Open Supabase → **SQL Editor** → paste the contents of
[`SUPABASE_PAYSTACK.sql`](SUPABASE_PAYSTACK.sql) → **replace
`CHANGE_THIS_PASSWORD` with your existing admin password** → **Run**.

This creates:

- `payments` table — audit log of every claim
- `claim_premium(user_id, reference, amount, currency)` — the RPC the
  frontend calls after a successful popup
- `get_payments_admin(password)` — admin RPC to list payments

RLS is enabled on `payments`, so anon access is denied. Only the RPCs
can touch the table.

---

## 3. Set the public key in your build

Edit `.env.production`:

```
VITE_PAYSTACK_PUBLIC_KEY=pk_test_XXXXXXXXXXXXXXXX
VITE_PAYSTACK_AMOUNT=5000
VITE_PAYSTACK_CURRENCY=NGN
```

- `VITE_PAYSTACK_AMOUNT` is the price in the **major unit** (so `5000`
  means ₦5,000, **not** ₦50).
- `VITE_PAYSTACK_CURRENCY` accepts `NGN`, `USD`, `GHS`, `ZAR`, or `KES`
  depending on what your Paystack account is enabled for.

Commit + push → GitHub Actions deploys to cPanel.

---

## 4. Test the flow

1. Open the live site in an incognito window.
2. Sign up with a test email/phone (via the Save or Export button).
3. Open the Layouts sidebar → click any 🔒 locked template.
4. UpgradeModal appears with `✦ Upgrade · ₦5,000` button — click it.
5. Paystack popup opens. Use one of their **test card numbers**:
   - Card: `4084 0840 8408 4081`
   - CVV: `408`
   - Expiry: any future date
   - PIN: `0000`
   - OTP: `123456`
6. After "Successful", the modal shows `✓ Premium activated` and the
   page reloads. All locked templates are now usable.

In Supabase → **Table Editor → payments**, your row should appear with
`status = 'claimed'`. Same user in `users` table now has `tier = 'premium'`.

---

## 5. Going live

When you're ready for real payments:

1. Switch to Live keys in Paystack dashboard.
2. Update `VITE_PAYSTACK_PUBLIC_KEY` to your `pk_live_...` value.
3. Redeploy.

---

## 6. (Recommended) Server-side verification via webhook

The current flow trusts the popup callback. Anyone who runs the right
JavaScript in dev tools could call `claim_premium` directly and self-
upgrade. To close that hole, set up a Paystack webhook that calls a
Supabase Edge Function:

### a. Create a Supabase Edge Function

In your Supabase project terminal:

```bash
supabase functions new paystack-webhook
```

`supabase/functions/paystack-webhook/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std/crypto/mod.ts';

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get('x-paystack-signature');

  // Verify HMAC
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(PAYSTACK_SECRET),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  if (sig !== expected) return new Response('Invalid signature', { status: 401 });

  const event = JSON.parse(body);
  if (event.event !== 'charge.success') return new Response('OK', { status: 200 });

  const reference = event.data.reference;
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  await supa.from('payments')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('reference', reference);
  return new Response('OK', { status: 200 });
});
```

### b. Deploy + register

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxx
supabase functions deploy paystack-webhook --no-verify-jwt
```

In Paystack dashboard → **Settings → API Keys & Webhooks → Webhook URL**:

```
https://<your-project-ref>.functions.supabase.co/paystack-webhook
```

### c. Optional: auto-revoke unverified

After 24 hours, any `payments` row still at `status = 'claimed'` (never
verified) is suspicious. Add a daily cron job or pg_cron task to revoke
premium for those users.

---

## Admin: viewing payments

The admin dashboard already has a `Tier` column and can manually toggle
users. To also see payment history, you can query in Supabase SQL Editor:

```sql
select u.email, p.reference, p.amount, p.currency, p.status, p.created_at
from public.payments p
left join public.users u on u.id = p.user_id
order by p.created_at desc;
```

Or extend `AdminDashboard.jsx` to call `get_payments_admin` and render
a second table — let me know if you want that.
