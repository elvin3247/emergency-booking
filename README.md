# Emergency HVAC booking site

Homeowners request emergency HVAC help, licensed contractors who can come say yes with an arrival time and visit fee, and the homeowner picks one. Static pages on Vercel, serverless functions in `api/`, Supabase for data, Resend for email. Vanilla JS, CommonJS, no framework, no build step.

## Pages

| Page | What it does |
| --- | --- |
| `/` | Home page: start a request, services, live county coverage (from `/api/coverage`) |
| `/request` | Homeowner picks a problem and enters details |
| `/status?t=...` | Homeowner's private page: who said yes, choose one, backups if no one confirms |
| `/respond?t=...` | Contractor's private page from the alert email: accept or pass |
| `/contractors` | Contractor sign-up |
| `/terms`, `/privacy` | Placeholders. Replace with lawyer-reviewed versions before launch. |

## Set up (about 30 minutes)

1. **Supabase:** create a project, open SQL Editor, and run `supabase/schema.sql`.
2. **Resend:** verify a sending domain and create an API key.
3. **Vercel:** import this repo (framework preset "Other"). Add the variables from `.env.example` under Settings > Environment Variables, then redeploy.
4. Set `SITE_URL` to the live address. Links in emails use it.

## Running it day to day

- **Approve contractors:** each sign-up emails `ADMIN_EMAIL`. Check the license with the NJ HVACR board, then in Supabase > Table Editor > `contractors`, change `status` from `pending` to `approved`. Only approved contractors get alerts. Set `paused` to stop alerts.
- **Requests:** you get an email for every request. The subject starts with `COVERAGE GAP` when no approved contractor covers that county at that hour.
- **Lead fees:** each match emails you the fee owed ($0 while a contractor has free leads left). The amount is saved in `alerts.lead_fee`. Billing is manual for now.
- **Brand name, lead fee, time limits, problem list:** all in `public/assets/config.js`.

## Try it locally without any accounts

```
npm install
npm run dev     # http://localhost:3000, data in memory, emails printed in the terminal
npm test        # checks the whole booking flow
```

In this mode contractors are approved automatically and the links from each "email" are printed in the terminal.

## Not built yet

- Text alerts. Email is the only channel until a texting number is approved.
- Charging contractors automatically.
- An admin screen. Use the Supabase table editor.
- ZIP to county lookup. Homeowners pick their county.
- Rate limiting beyond a hidden spam-trap field.
