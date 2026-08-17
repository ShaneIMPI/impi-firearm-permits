# IMPI Digital Firearm Permit System — Setup Guide

No coding needed. Follow these steps in order.

## 0. Add your logo

Drop your master tri-circle logo file into the `assets` folder, named exactly
`impi-logo.png`. The app and the public verification page already point to
`assets/impi-logo.png` — nothing else to change. See `assets/README-LOGO.txt`.

## 1. Create the database (Supabase)

1. Go to supabase.com → create a new project (or use one you already have).
2. Once it's created, go to **SQL Editor** → **New Query**.
3. Open `supabase-schema.sql` from this package, copy all of it, paste it in, click **Run**.
4. Go to **Settings → API**. Copy the **Project URL** and the **anon public key**.
5. Open `config.js` in this package and paste those two values in where marked.

## 2. Create your login (Supabase Auth)

1. In Supabase, go to **Authentication → Users → Add user**.
2. Create a user with your email and a password — this is what you (and any other
   authorised issuer, e.g. Jacques) will use to log into the permit system.
3. Repeat for each person who should be allowed to issue permits.

## 3. Get WhatsApp sending working (Twilio)

WhatsApp doesn't let ordinary emails/servers send messages directly — you need a
Twilio account, which handles this for you.

1. Go to twilio.com → sign up (free trial available).
2. In the Twilio console, find **Messaging → Try it out → Send a WhatsApp message**.
   This gives you a **WhatsApp Sandbox number** you can start with immediately —
   good for testing with your own phone today.
3. Note down three values from the Twilio console:
   - **Account SID**
   - **Auth Token**
   - **WhatsApp-enabled number** (sandbox number, format `whatsapp:+14155238886`)
4. **Important**: with the sandbox, each officer's phone must first send the
   join code (shown in the Twilio console) to the sandbox number on WhatsApp
   once, before they can receive messages from it. This is a Twilio limit, not
   ours. For a permanent, no-opt-in-required setup, you'll later apply for a
   proper **WhatsApp Business API number** through Twilio (takes a few days for
   Meta's approval) — same code, you just swap the number.

## 4. Deploy the site (Netlify — same as your Induction Portal)

1. Create a new GitHub repo, e.g. `impi-firearm-permits`, upload all the files
   in this package to it (GitHub → Add file → Upload files).
2. In Netlify: **Add new site → Import an existing project → connect the repo**.
3. Once deployed, go to **Site settings → Environment variables** and add:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+14155238886`)
4. Redeploy the site (Netlify does this automatically after you save env vars,
   or trigger it manually under **Deploys → Trigger deploy**).

## 5. Using it day to day

- Log in at your Netlify URL.
- **Officers** tab — add each armed officer once (name, ID, competency number
  and expiry, WhatsApp number).
- **Firearms** tab — add each company firearm once (make, model, calibre,
  serial, licence reference).
- **Issue Permit** tab — pick officer + firearm, set ammo count, duty location,
  purpose, and valid-until date/time → click Issue. The officer gets a WhatsApp
  message immediately with all the details and a verification link.
- **Active / Book In** tab — when the officer's shift ends, book the firearm
  back in here. This closes the permit and returns the firearm to "in store".
- **Full Register** tab — the complete audit trail (who had what, when, issued
  by whom) — exportable to CSV any time, satisfying the record-keeping
  requirement under the Firearms Control Regulations.

## Legal note (read this)

This system is an **internal company register and authorisation tool** under
your Section 20 business firearm licence — it does not replace:
- the officer's own physical competency certificate, which must be on their
  person while on duty, or
- your existing delegation letter from the licensed responsible person
  authorising you to administer issuing/tracking.

Please have your firearms attorney or Designated Firearms Officer review the
register fields and the delegation wording before relying on this as your
official compliance record.
