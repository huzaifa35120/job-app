# Auto Job Apply

A personal tool that searches for jobs every day (Australia + remote worldwide), uses Claude to match each job to your profile, writes a tailored resume and cover letter for the best matches, and tracks exactly how much every AI call costs, with a daily spending limit for each task.

## What it does

| Page | What's there |
|---|---|
| **Dashboard** | Spend today / this month / all time, estimated Anthropic credit remaining, today's spend vs each daily limit, live feed of AI calls (refreshes every 4s), recent runs, "run now" buttons, setup checklist |
| **Jobs** | Keyword search ("Data Analyst", "Web Developer"…) that runs immediately and can repeat daily, saved searches, recommended jobs sorted by match score, filters, shortlist/hide |
| **Job detail** | Match score with reasons, matches and gaps · write/rewrite a tailored resume + cover letter · PDF download · editable cover letter · AI drafts answers to application questions · fetch or paste the full description · status tracker (new → applied → interview → offer) · notes · AI cost for that job |
| **Profile** | Upload your resume PDF and AI fills in everything · edit all details · target roles (searched daily) · work rights, availability, salary · writing sample and banned phrases |
| **Usage & costs** | Daily spend by task for 31 days, spend by model and by task, and every AI call with its tokens and cost |
| **Settings** | Daily USD limit and model for each task · credit balance · job sources · free filters · automation · company job boards to watch |

### How a day works
1. **~6–7am Sydney** (Vercel cron, `/api/cron/search`): runs your profile's target roles plus your saved keyword searches across the free job sources (and AI web search if enabled), filters out junk for free, saves new jobs, and starts matching them with Claude.
2. **An hour later** (`/api/cron/finish`): finishes matching, then writes a resume and cover letter for the top matches (default: score ≥ 75, at most 3 a day).
3. **You**: open the Jobs page, review the matches, download the PDFs, apply on the employer's site and mark the job as applied.

Every AI call checks that task's daily limit first. When the limit is reached, that task stops until midnight.

### Job sources
- **Free:** Remotive, Jobicy, Himalayas and Remote OK (remote jobs), plus Greenhouse/Lever/Ashby boards of companies you add in Settings.
- **Free with a key:** [Adzuna](https://developer.adzuna.com) for Australian jobs. Sign up and copy the App ID and Key.
- **Paid (optional):** AI web search, where Claude searches Seek, LinkedIn, Indeed and others. It costs about $0.01 per search plus tokens and uses the "Finding jobs" limit.

The app always shows where a job came from and links to the original posting, as these sources ask.

### Default models
- Matching uses **Claude Haiku 4.5**, the cheapest. It scores 5 jobs per request, which costs fractions of a cent per job.
- Resumes, cover letters, answers, resume import and web search use **Claude Opus 5**, the best writer. Opus calls use Anthropic's server-side refusal fallback, so a rare safety decline is retried on another model automatically.
- You can change the model for each task in Settings.

## Run it on your Mac

```bash
npm install
```

Open `.env.local` and paste your Anthropic API key after `ANTHROPIC_API_KEY=` ([get one here](https://platform.claude.com/settings/keys)). Then:

```bash
npm run dev
```

Open http://localhost:3000 and log in. Locally it uses a built-in database stored in `.data/`, so no setup is needed.

## Put it on Vercel

1. Push this folder to a **private** GitHub repo. `.env.local` is git-ignored, so your keys are not uploaded.
2. In Vercel: **Add New → Project**, then import the repo.
3. Add a database: **Storage → Create Database → Neon** (free tier) and connect it to the project. This sets `DATABASE_URL` for you.
4. In **Settings → Environment Variables**, add these (copy the values from `.env.local`):
   - `ANTHROPIC_API_KEY`
   - `APP_USERNAME`, `APP_PASSWORD`
   - `AUTH_SECRET`
   - `CRON_SECRET`
   - optional: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`
5. **Deploy**, or redeploy after adding the variables. The two daily jobs in `vercel.json` are registered automatically.
6. Open the site, go to **Profile**, upload your resume, check it and press **Save**.

Vercel's free Hobby plan is enough. It allows functions up to 5 minutes and cron jobs once a day, and the app is built around both.

## Costs and limits

- Costs are calculated from the exact token counts Anthropic returns, at list prices (`src/lib/pricing.ts`).
- Limits are checked before every call. Several calls can run in parallel, so a limit can be overshot by about one call.
- Anthropic has no API for your credit balance. Enter it in Settings after each top-up, and the dashboard subtracts what this app spends from then on. If the same API key is used by other apps, the estimate won't include their spending.
- With an organisation account you can also set `ANTHROPIC_ADMIN_KEY` (an Admin key) to show Anthropic's own cost figures on the dashboard.

## Changing your login

The login comes from `APP_USERNAME` and `APP_PASSWORD`. Change them in `.env.local` or Vercel and redeploy. After 5 wrong passwords, an IP address is locked out for 15 minutes. Because the site is public on the internet and controls spending on your API key, a long password is worth it.

## Project layout

```
src/lib/claude.ts        every Claude call: limit check → call → exact cost logged
src/lib/ai.ts            prompts: matching, resume + cover letter, answers, resume import
src/lib/pipeline.ts      daily search → filter → match → write (with time and spend limits)
src/lib/sources/         job sources (free APIs, company boards, AI web search)
src/lib/usage.ts         spend tracking, daily limits, stats
src/lib/pdf.tsx          resume + cover letter PDFs
src/app/api/             API routes (cron jobs in api/cron)
src/app/(app)/           pages
```
