# CyberSage

> AI-powered cybersecurity learning simulation platform — built for the University of Melbourne FEIT Hackathon 2026.

## What it does

CyberSage puts learners inside real-world cybersecurity scenarios. You make decisions under pressure, see consequences immediately, and get coaching from **SAGE** — an AI tutor powered by GPT-4o that explains *why* each choice matters.

## Scenarios (MVP)

| # | Scenario | Threat Type | Difficulty |
|---|---|---|---|
| 1 | The Suspicious Email | Phishing | Beginner |
| 2 | The Borrowed Badge | Tailgating / Physical Security | Beginner |
| 3 | System Under Attack | Ransomware / Incident Response | Intermediate |

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **AI Tutor**: OpenAI GPT-4o via API
- **Animation**: Framer Motion
- **State**: localStorage (MVP) — Supabase-ready
- **Deploy**: Vercel

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Add your OpenAI API key
cp .env.example .env.local
# Edit .env.local and add your OPENAI_API_KEY

# 3. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
app/
  page.tsx              # Home — mission selection
  scenario/[id]/        # Individual scenario page
  dashboard/            # Progress & skills dashboard
  api/tutor/            # AI Tutor API route (GPT-4o)
components/
  scenario/             # ScenarioCard, ChoicePanel, FeedbackPanel
  tutor/                # TutorPanel (SAGE chat)
  ui/                   # XPBar, Badge
data/
  scenarios.ts          # All scenario content (JSON-driven)
lib/
  progress.ts           # XP, badges, skill scoring logic
types/
  index.ts              # Shared TypeScript types
```

## Adding New Scenarios

Edit `data/scenarios.ts` — each scenario follows the `Scenario` interface. Chain them with `nextScenarioId` in the correct choice.

## Hackathon Theme Alignment

- **Focus Area A**: AI Tutor (SAGE) guides learners in real time
- **Focus Area D**: Simulation environment with branching decisions
- **Focus Area C**: Adaptive progression — locked scenarios unlock on completion
