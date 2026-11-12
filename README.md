# Emergency home repair booking site

Homeowners request emergency help (heating, cooling, plumbing, water heaters, and more as you switch them on), licensed local pros who can come say yes with an arrival time and visit fee, and the homeowner picks one. Static pages on Vercel, serverless functions in `api/`, Supabase for data, Resend for email. Vanilla JS, CommonJS, no framework, no build step.

## Pages

| Page | What it does |
| --- | --- |
| `/` | Home page: start a request, services, live county coverage (from `/api/coverage`) |
| `/hvac`, `/plumbing`, `/<trade>/<county>-county-nj` | For each trade that is switched on, an index and one page per county: booking bar, live contractor list, towns and ZIP codes |
| `/help`, `/help/<problem>` | Troubleshooting guides ("quick checks") with a booking bar |
| `/request` | Homeowner picks a problem and enters details |
| `/status?t=...` | Homeowner's private page: who said yes, choose one, backups if no one confirms |
| `/respond?t=...` | Contractor's private page from the alert email: accept or pass |
| `/contractors` | Contractor sign-up, step 1 (name, contact, license, counties) |
| `/pro?t=...` | Contractor's private page from their emails: finish setup (visit fee, business phone), pause or resume alerts, change settings |
| `/terms`, `/privacy` | Placeholders. Replace with lawyer-reviewed versions before launch. |

## Set up (about 30 minutes)

1. **Supabase:** create a project, open SQL Editor, and run `supabase/schema.sql`.
2. **Resend:** verify a sending domain and create an API key.
3. **Vercel:** import this repo (framework preset "Other"). Add the variables from `.env.example` under Settings > Environment Variables, then redeploy.
4. Set `SITE_URL` to the live address. Links in emails use it.

## Running it day to day

- **Contractor setup:** a contractor gets no requests until they've added a visit fee and business phone (step 2) and you've approved them. They can pause themselves from the link in any alert; `paused_until` shows it in Supabase.
- **Approve contractors:** each sign-up emails `ADMIN_EMAIL`. Check the license with the state board for each trade they picked (the `trades` column: HVACR, master plumbers, electrical contractors), then in Supabase > Table Editor > `contractors`, change `status` from `pending` to `approved`. Only approved contractors get alerts. Set `paused` to stop alerts.
- **Requests:** you get an email for every request. The subject starts with `COVERAGE GAP` when no approved contractor covers that county at that hour.
- **Lead fees:** each match emails you the fee owed ($0 while a contractor has free leads left). The amount is saved in `alerts.lead_fee`. Billing is manual for now.
- **Brand name, lead fee, time limits, problem list:** all in `public/assets/config.js`.

## Search and marketing

- **Generated pages:** the county pages, guides, `robots.txt`, `sitemap.xml`, and the title, description, share, and structured-data tags on every page come from `npm run build`. Run it after changing `public/assets/config.js` or `scripts/content.js`, then commit the result. Vercel needs no build step.
- **Before launch:** set `brand` and `siteUrl` in `public/assets/config.js` and run `npm run build`. Without `siteUrl` there is no sitemap and no canonical links. Then submit `/sitemap.xml` in Google Search Console.
- **Guide wording:** edit `scripts/content.js`.
- **Tracking where requests come from:** give each referral partner a link like `https://yoursite.com/?ref=agent-smith`. Ad links with `utm_source` work too. The source is saved in the `source` column on `requests` and `contractors` and shown in your admin emails. If you created the database before this was added, run `supabase/schema.sql` again; it is safe to rerun.
- **Page views:** turn on Web Analytics for the project in Vercel. To remove it, set `analytics: ''` in the config.
- **ZIP codes:** `scripts/nj-zips.json` comes from GeoNames (geonames.org), CC BY 4.0. The footer credit satisfies the license, so keep it.

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

## Services and trades

`public/assets/config.js` has two lists:

- **`services`** is what homeowners pick (Heating, Cooling, Plumbing, Water heater, Electrical, Appliances). Each points at a trade.
- **`trades`** is what contractors sign up as (HVAC, plumbing, electrical, appliance repair). A request only alerts contractors in the matching trade who cover that county.

A service with `live: false` shows as "Soon" on the site and can't be requested, but contractors in that trade can already apply. To open one up, set `live: true`, run `npm run build` (this creates its county pages), and commit.

If your database was created before this change, run `supabase/schema.sql` again. It adds the `trades` and `service` columns and is safe to rerun. Existing contractors default to HVAC.
