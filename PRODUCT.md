# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, a university student in Sydney looking for internships, graduate and junior roles (tech and data) in Australia and remote roles open to Australia. Single account; no other users planned.

Uses it equally on a phone (checking new matches and spending on the go) and on a laptop (reviewing tailored resumes and cover letters, downloading PDFs, applying on employer sites).

## Product Purpose

A personal job-search assistant. Every morning it searches job sites, filters out irrelevant postings for free, uses Claude to score each remaining job 0–100 against the owner's profile, and writes a tailored one-page resume and cover letter for the best matches. The owner reviews, downloads the PDFs and applies themselves on the employer's site.

Success: less time searching and tailoring, better-targeted applications, and always knowing exactly what the AI is costing.

## Positioning

Unlike mass auto-apply bots, it never submits anything itself: it finds, ranks and drafts, and the owner decides and applies. Every AI call is metered with exact token cost, and each task (finding, matching, writing, answers, resume import) has its own daily spending limit enforced before every call.

## Operating Context

- Daily rhythm: automatic search ~6–7am Sydney time, matching and writing an hour later; the owner reviews once a day.
- Job sources: Remotive, Jobicy, Himalayas, Remote OK (free), Adzuna for Australia (free key), company boards on Greenhouse/Lever/Ashby, optional paid AI web search covering Seek/LinkedIn/Indeed.
- Workflow per job: review score and reasons → check/edit generated resume and cover letter → download PDFs → open the posting and apply → track status (new, shortlisted, applied, interview, offer, rejected, hidden).
- Money context: pays for Anthropic API usage from a small prepaid credit balance (around US$20), so spend visibility matters on every screen that triggers AI.
- Hosted on Vercel (Hobby) with a Neon Postgres database; long AI operations can take 30 seconds to 4 minutes.

## Capabilities and Constraints

- Pages: Login, Dashboard, Jobs, Job detail, Profile, Usage & costs, Settings.
- Next.js 16 App Router, React 19, plain CSS (no UI framework yet). Client-rendered pages calling JSON API routes.
- Models: Claude Haiku 4.5 for matching; Claude Opus 5 for writing, answers, resume import and web search (user-selectable per task).
- No API exists for the Anthropic credit balance; the owner enters it manually and the app subtracts its own recorded spend.
- The app must never invent experience: generated documents use only facts in the profile and flag gaps for review.
- Does not submit applications or log into job sites.

## Brand Commitments

Name: "Auto Job Apply". No logo or other brand assets yet.

## Evidence on Hand

No testimonials, users or metrics beyond the owner's own usage data stored in the app.

## Product Principles

1. The owner stays in control: the tool recommends and drafts; the owner decides and applies.
2. Money is always visible: any action that costs money shows what it costs and what's left.
3. Truthful output: documents only rephrase real experience and say clearly what to double-check.
4. Fast daily review: the best matches surface first and a day's review fits in a few minutes, on phone or laptop.
