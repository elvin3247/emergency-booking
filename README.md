# Emergency home repair booking site

Homeowners request emergency help (heating, cooling, plumbing, water heaters, and more as you switch them on), licensed local pros who can come say yes with an arrival time and visit fee, and the homeowner picks one. Static pages on Vercel, serverless functions in `api/`, Supabase for data, Resend for email. Vanilla JS, CommonJS, no framework, no build step.

## Pages

| Page | What it does |
| --- | --- |
| `/` | Home page: start a request, services, live county coverage (from `/api/coverage`) |
| `/hvac`, `/plumbing`, `/<trade>/<county>-county-nj` | For each trade that is switched on, an index and one page per county: booking bar, live contractor list, towns and ZIP codes |
| `/water-heater`, `/water-heater/<county>-county-nj` | Water heater pages for each county: problems, what to do first, live coverage from plumbers |
| `/whats-wrong` | Room-by-room guide: every problem, when it can't wait, and what to do first, with the house drawing |
| `/help`, `/help/<problem>` | Troubleshooting guides ("quick checks") with a booking bar |
| `/request` | Homeowner picks a service, then a problem, and enters details |
| `/status?t=...` | Homeowner's private page: who said yes, choose one, backups if no one confirms |
| `/respond?t=...` | Contractor's private page from the alert email: accept or pass |
| `/contractors` | Contractor sign-up, step 1 (name, contact, license, counties) |
| `/pro?t=...` | Contractor's private page from their emails: finish setup (visit fee, business phone), pause or resume alerts, change settings |
| `/terms`, `/privacy` | Plain-language drafts with blanks in [brackets]. A lawyer needs to finish them before launch. |
| `/admin` | Your page: approve contractors, see requests and coverage gaps, test goals, lead fees, the launch checklist, and recruiting. Locked by `ADMIN_KEY`. |
| `/unsubscribe?inv=...` | The "don't email me again" link in recruiting emails |

## Set up (about 30 minutes)

1. **Supabase:** create a project, open SQL Editor, and run `supabase/schema.sql`.
2. **Resend:** verify a sending domain and create an API key.
3. **Vercel:** import this repo (framework preset "Other"). Add the variables from `.env.example` under Settings > Environment Variables, then redeploy.
4. Set `SITE_URL` to the live address. Links in emails use it. If it's missing, emails fall back to Vercel's own address for the project.
5. When you pick a name and domain, set `brand` and `siteUrl` in `public/assets/config.js`, run `npm run build`, and commit. That turns on the sitemap, canonical links, and share previews. (If Vercel runs the build, `SITE_URL` alone also works.)
6. Open `/admin`, go to **Launch checklist**, and fix anything marked "Fix this".

## Running it day to day

- **Contractor setup:** a contractor gets no requests until they've added a visit fee and business phone (step 2) and you've approved them. They can pause themselves from the link in any alert; `paused_until` shows it in Supabase.
- **Approve contractors:** each sign-up emails `ADMIN_EMAIL`. Open `/admin`, check the license with the state board for each trade they picked, and press Approve. Only approved contractors get alerts. Pause stops them.
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
npm install     # once, after cloning
npm run dev     # http://localhost:3000, test data in memory, emails and texts printed in the terminal
npm test        # checks the whole booking flow
```

In this mode contractors are approved automatically, the links from each "email" are printed in the terminal, and the admin page
(`/admin`) opens with the key `demo`. Press Ctrl+C to stop. Works the same on Mac and Windows.

- Edited HTML, CSS, or JS in `public/`? Just refresh the browser.
- Edited `public/assets/config.js`, `scripts/content.js`, `scripts/triage.js`, or `scripts/build.js`? Run `npm run build`, then refresh.
- Publish: `git add -A`, `git commit -m "what changed"`, `git push`. Vercel deploys `main` on every push. Push a different branch to get a private preview link first.

## Not built yet

- Charging contractors automatically.
- Text messages to homeowners (pros only for now).

## Launch checklist (admin page)

The "Launch checklist" tab checks everything the live site depends on and says how to fix what isn't ready: brand name, web address and sitemap,
mailing address, Supabase tables and the photo bucket, the Resend sending domain, Twilio, `CRON_SECRET` and when the daily job last ran, and
how many counties have live pros. "Prove it works" sends a real test email, a test text, and a sample job alert so you can see them arrive.

## Text alerts for pros

- Pros opt in with a separate box at sign-up, or from their settings page. Email always goes too, so a missed text never means a missed job.
- Texted: new requests, "still open" reminders, "you were chosen" (with the customer's number), confirm reminders, switched pros, and cancellations.
- Texting stays off until `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM`) are set in Vercel.
- **Register first.** US carriers block business texts from unregistered senders. In Twilio, register a 10DLC campaign (brand plus a "customer care / account notifications" use case) or verify a toll-free number. They'll ask for: your opt-in wording (it's `consent.sms` in `public/assets/config.js`), sample messages (see `lib/emails.js`, the `text:` lines), and your privacy policy link. Approval can take days to a few weeks.
- STOP and HELP replies are handled by Twilio's messaging service. If a text fails because the person replied STOP or the number isn't a mobile, the site turns texts off for that pro and shows why on their settings page.
- Run `supabase/schema.sql` again to add the new columns.

## Recruiting (admin page)

- **Where you need pros:** a county-by-trade map of live pros. Red is nobody, yellow is 1 or 2, green is 3 or more. It also shows applicants waiting on you, companies on your list, and requests in the last 30 days that had nobody to alert. Tap a box to filter your list to that county and trade.
- **Add a list:** paste rows from a spreadsheet or pick a CSV file. Columns are matched by name (Company, Contact, Email, Phone, Town, County, ZIP, Trade or Category, Website, License, Notes). County comes from the county, ZIP, or town; trade from words like HVAC or plumbing. Duplicates and companies already signed up are skipped.
- **Invite:** pick companies and send up to 100 at a time, with an optional personal line. Each email has a private link, so you see who clicked and who applied. Nobody is invited more than once a week or more than 3 times, and anyone who uses the "don't email me again" link is never emailed again.
- **The law:** recruiting emails to companies that haven't signed up need your postal address and an opt-out (CAN-SPAM). The opt-out is built in. Set `MAILING_ADDRESS` in Vercel (or `mailingAddress` in config.js); bulk invites stay off until you do.
- **After a call:** "Invite one after a call" sends the sign-up link and adds them to the list, so it's tracked too.

## Services and trades

`public/assets/config.js` has two lists:

- **`services`** is what homeowners pick (Heating, Cooling, Plumbing, Water heater, Electrical, Appliances). Each points at a trade.
- **`trades`** is what contractors sign up as (HVAC, plumbing, electrical, appliance repair). A request only alerts contractors in the matching trade who cover that county.

A service with `live: false` shows as "Soon" on the site and can't be requested, but contractors in that trade can already apply. To open one up, set `live: true`, run `npm run build` (this creates its county pages), and commit.

If your database was created before this change, run `supabase/schema.sql` again. It adds the `trades` and `service` columns and is safe to rerun. Existing contractors default to HVAC.

## Admin page, reviews, and spam limits

- **`/admin`** is your page for running the business: applications to approve, requests that had no one to alert, low ratings, every contractor, the latest 100 requests, and lead fees owed (mark paid or waive). It is locked by one key. In Vercel, add an environment variable `ADMIN_KEY` with a long random value (a password manager can make one), redeploy, and type that value into the page. Until `ADMIN_KEY` is set, the page stays locked.
- **Reviews:** after a homeowner chooses a pro, their request page asks how the visit went (1 to 5, plus "never showed up"). You get an email for each review. A pro's average shows to homeowners once they have `minReviews` reviews (3, set in `config.js`).
- **Spam limits:** one email or phone can send `limits.perContactHour` requests an hour (3), and one internet connection `limits.perDeviceHour` (6). Change them in `config.js`.
- **Terms and privacy** are plain-language drafts with blanks in [brackets]. A lawyer needs to review and finish them before launch.

Run `supabase/schema.sql` again after pulling this change. It adds the columns for reviews, fees, and limits and is safe to rerun.

## Cancel, no-shows, photos, on-the-way updates, job results, profiles, and lost links

Run `supabase/schema.sql` again after pulling this. It adds the new columns, a `link_sends` table, and a private Storage bucket called `photos`. It is safe to rerun.

**Homeowners** (request page)
- **Cancel** in two taps, with a reason. Pros who said yes are emailed. If they had already chosen a pro, that pro is told not to come, a free lead is given back, and a paid lead fee goes to you to decide.
- **"They're not coming, find someone else."** The chosen pro is marked as a no-show, their free lead is given back (or a paid fee goes to you to decide), you get a NO-SHOW email, and the request goes out again to every other pro in that county and trade. The page says it was sent out again.
- **Live arrival status**: "On the way, expected around 9:10", "Running late", "Has arrived". The page refreshes itself.
- **Photos**: up to 3, on the form or added later. Phones shrink them before sending. Alerted pros see them on the job page. Links to photos expire after an hour.
- **Review** now asks whether the pro arrived when they promised.
- **"See profile"** on every offer.

**Contractors**
- **Their page** (`/pro?t=...`) now opens with every job they were sent: won, lost, passed, canceled, no-show, and lead fees open or paid. Customer details are only on each job's own page.
- **Job page** after being chosen: "On my way" (15 to 90 minutes), "Running late", "I'm here", then "Job done", "Customer canceled", or "Couldn't reach the customer". The last two put a paid lead fee in front of you.
- **Public profile**: about, years in business, website. Shown at `/company?id=...` with license, counties, rating (after 3 reviews), on-time rate, and written reviews.
- **Extra alert emails**: up to 3, copied on alerts and job emails.

**Both**: `/find` emails every link for an address (requests from the last 30 days and the contractor page). It answers the same way whether or not the email is known, and sends at most 3 an hour per address.

**You**: the admin page's "Needs you" tab has a new "Lead fees to decide" list (Waive or Keep fee), canceled and resent requests are labeled, and the test goals now include on-time rate and no-shows.

Not built yet: card payments for lead fees (needs a Stripe account), text messages (waiting on Twilio approval), and a review reminder email.

## Faster requests: alert first, auto-booking, answer times, alerts, remembered details

Run `supabase/schema.sql` again after pulling this. Name and address become optional on a request, and two columns are added for auto-booking.

- **Alert first, details second.** The request form now needs only ZIP, phone, email, and how soon. Pros are alerted right away. Name, address, notes, and photos are optional on the form. If skipped, the request page asks for name and address while pros answer, or in the same step as choosing. Nobody can be chosen until name and address are in.
- **Book the first pro automatically.** An optional box on the form: the first pro who says "Within 1 hour" at or under the homeowner's visit-fee limit ($100, $150, $200, or any) is chosen on the spot. It waits for name and address if they're missing, then books the moment they arrive. The email subject says "Booked for you."
- **Typical answer time.** "Plumbers near you usually answer in about 6 minutes," from the last 60 days. It only shows once a county and trade have 5 requests with a yes (otherwise it falls back to all of New Jersey, or shows nothing). Recomputed at most every 10 minutes. Also returned by `/api/coverage` as `speed`.
- **Chime when a pro says yes.** "Turn on alerts" on the request page plays a chime, vibrates on Android, and shows a notification if the tab is in the background and the browser allows it. The tab title changes to "(1) A pro can come" either way. Browsers require that tap before any sound, and iPhones only show notifications for sites added to the home screen.
- **Returning homeowners.** Name, phone, email, address, and ZIP are kept on the device (browser storage, never sent anywhere else) and filled in next time, including the ZIP on the home page. "Not you? Clear" removes them.

## Free launch

`freeLaunch: true` in `public/assets/config.js` makes the site free for every contractor: no lead fees are recorded, each pro's free leads are saved for later, and the home page, contractor page, emails, job pages, and terms all say "free during our launch." The terms promise 30 days' email notice before any fee starts. To start charging, set it to `false`, run `npm run build`, and commit; the $50 per lead after 3 free leads (or whatever `leadFee` and `freeLeads` say) then applies to new matches only.

## Stuck requests, daily job, contact fixes, funnel, admin tools, phone menu

Run `supabase/schema.sql` again after pulling this (new columns plus an `events` table). Add `CRON_SECRET` in Vercel (any long random value) so the daily schedule can run.

**Stuck requests** (timers in `config.js`; they run as the homeowner's page refreshes, on any coverage lookup, and in the daily job, since Vercel's free plan has no every-minute timer)
- **No yes after 10 minutes (`widenMin`)**: pros who haven't answered get a reminder, and pros in neighboring counties (`neighbors`) get the alert, marked "just outside your counties." The homeowner's page says so.
- **Runner-ups on standby for 30 minutes (`standbyMin`)**: when the homeowner chooses, the others who said yes are told they're on standby instead of simply "filled."
- **The chosen pro confirms within 10 minutes (`confirmMin`)**: their job page asks them to call and tap "I've talked to the customer" (an "On my way" update also counts). If they don't, they get a reminder, and the homeowner gets an email and a card offering the standby pros with a one-tap "Switch to them," or sending it out to everyone again. The pro who was switched away from is told not to come.
- **Alert emails** show the town in the subject ("New burst or leaking pipe in Warren") and include "Pause alerts until 7am," which opens their page with a one-tap confirm.

**Daily job** (`vercel.json` runs `/api/admin?job=daily` once a day, sometime between 6 and 7am New York time in winter; the admin page also has "Run daily tasks now")
- Review reminder for visits 6 hours to 7 days old with no review (once each).
- "Sorry, nobody could take your request" with a one-tap "Send it again" for requests that closed with no match (once each).
- Deletes photos older than 90 days (`keepPhotosDays`).
- Morning summary email to `ADMIN_EMAIL`.
- Keeps Supabase awake (free projects pause after a week of low activity).

**Homeowners** can fix a wrong phone number or email on their request page. If a pro was already chosen, the pro gets the correction.

**Funnel**: page steps are saved in your own database (`/api/track`, an allowed list of step names, no personal details) because Vercel's free plan doesn't keep custom events. The admin page's "Funnel and invites" tab shows started, sent, got a yes, chose a pro, and reviewed for the last 7 days, plus the contractor sign-up steps.

**Admin tools**: invite a contractor after a call (emails a sign-up link with their email filled in), edit a contractor's company, license, phone, trades, and counties, remove a spam request (two taps; pros who said yes are told), hide or show a review (hidden reviews leave the rating and profile), and run the daily tasks now.

**Phone menu**: a Menu button in the header on small screens with Services, How it works, Quick checks, Find my request, and For pros.

For testing on a local preview only, `WIDEN_MIN`, `CONFIRM_MIN`, and `STANDBY_MIN` shorten those timers (for example `WIDEN_MIN=0.1`). Don't set them in Vercel.
