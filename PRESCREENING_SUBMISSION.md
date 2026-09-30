# LearnArena — Make Learning a Game Worth Coming Back To

**Pre-screening submission | FEIT Hackathon Festival | 30 September 2026**

**Team name:** NEX5

---

## Slide 1 — Project Overview

### LearnArena
**A gamified learning platform that makes practice engaging, measurable and social.**

### Problem
Many learners struggle to maintain consistent study habits. Practice can feel repetitive, feedback is often limited to right or wrong, and learners may not know which topics need more attention. Without a clear sense of progress or a reason to return, motivation can fade. This makes it harder for students to build knowledge steadily and for educators or learning communities to encourage ongoing participation.

### Our solution
LearnArena turns short learning sessions into interactive challenges. Learners can practise through quizzes, speed-math rounds, memory-recall games and branching scenarios. After a session, they can review answers, earn points and see changes in their topic-level skills. Daily challenges, streaks, achievements, leaderboards and friend-based play provide goals and social encouragement to help learners keep practising.

### How it helps
- **Makes practice active:** several game formats offer alternatives to a standard quiz.
- **Makes progress visible:** results, skill tracking and learning history show how a learner is progressing.
- **Encourages consistency:** daily challenges, streaks, milestones and achievements give learners reasons to return.
- **Adds social motivation:** friends, weekly leaderboards and multiplayer modes make practice collaborative and competitive.

**Intended users:** students and lifelong learners who want a more engaging way to practise and track learning. The current content fixtures cover science, mathematics and logic topics.

---

## Slide 2 — Tech & Progress

### Technology and tools
- **Web application:** Next.js, React and TypeScript.
- **Data and authentication:** Supabase Auth and PostgreSQL, accessed through Drizzle ORM.
- **Real-time multiplayer:** Socket.IO service with Redis support for lobby and game coordination.
- **Workspace:** pnpm monorepo and Turborepo, with shared packages for domain rules and database access.
- **Background processing:** worker jobs update skills, coaching recommendations, achievements and derived projections.
- **Optional AI:** coaching narration can use an AI provider when configured; deterministic templates provide a fallback.

### What is built so far
LearnArena is an implemented local demo, not just a concept or mock-up. The project includes:

- Email sign-in and learner onboarding.
- Solo quizzes with answer feedback, points and results review.
- Speed math, memory recall and branching scenario activities.
- Daily challenges, streaks, streak freezes, milestones and weekly leaderboards.
- Skill tracking, deterministic recommendations, learning history and achievements.
- Friend requests, invitations, multiplayer lobbies, co-op quizzes and team knowledge deathmatch.
- Admin workflows for authoring, reviewing and publishing learning content and challenges.
- Privacy controls, including data export and account deletion flows.

The local stack has been configured to run the web app, real-time service and background worker together. The implementation status records a successful production build and local setup. Earlier targeted domain, integration and browser checks were completed; full release validation is still outstanding.

### Day 3 MVP delivery plan
The core application already goes beyond the minimum single-player flow. For a clear Day 3 MVP demonstration, we will prioritise a reliable end-to-end learner journey:

1. **Sign in and onboard** a learner.
2. **Start and complete a short quiz** from the Home experience.
3. **Review the result**, including points, answer feedback and skill changes.
4. **Complete a daily challenge** and show how it contributes to ongoing engagement.
5. **If demo time and setup allow,** show a second learner joining a co-op lobby.

**Definition of a successful MVP demo:** a reviewer can move through the core learning loop without setup interruptions and understand how LearnArena combines practice, feedback and motivation. Multiplayer is a stretch demonstration; team deathmatch currently requires four players, and the project has not completed full four-player acceptance or load testing.

---

## Slide 3 — Product Flow, Architecture & Demo

### Learner use-case flow

**Sign in → Choose a practice activity → Answer questions / play a learning game → See results and skill feedback → Continue with a daily challenge or invite friends**

### Product screens to show
- **Home:** practice entry points, current streak and daily challenge.
- **Games:** quiz and solo activity choices, including speed math, memory recall and scenarios.
- **Results:** points, answer review and skill changes.
- **Skills / History:** learning progress across topics and past sessions.
- **Friends / Lobby:** social play and co-op session setup.

### High-level architecture

**Learner browser** → **Next.js web app and API** → **Supabase Auth + PostgreSQL**

For live multiplayer, the web app coordinates with the **Socket.IO real-time service**, using **Redis** for supporting coordination. A **background worker** processes learning events and updates derived information such as skills, recommendations and achievements. Shared core packages contain game rules, scoring and validation logic.

### Demo and repository
- **Repository:** [github.com/JauChen02/FEIT-Hackathon-Festival](https://github.com/JauChen02/FEIT-Hackathon-Festival)
- **Demo:** no hosted demo URL is currently documented. The project can be demonstrated locally using the setup instructions in the repository README.

---

## Submission details

**Submission title:** LearnArena — Make Learning a Game Worth Coming Back To  
**Team name:** [Add team name]  
**Team member names:** not included, as requested in the pre-screening instructions.

## Pre-screening criteria alignment

- **Potential Effectiveness (40%):** targets practice consistency and learner motivation through short activities, feedback, progress tracking and recurring goals.
- **Technical Feasibility (30%):** a functioning web application and local stack are implemented, including authentication, persistence, game flows, background processing and real-time multiplayer foundations.
- **Viability — Business & Social Uptake (10%):** the product is designed for students and learning communities; friends, leaderboards and co-op play offer social participation. Broader adoption and business viability remain to be validated with users.
- **Originality (15%):** combines multiple learning game formats with skill feedback, daily engagement systems and social multiplayer in one learning experience.

## Current limitations to describe accurately

The repository documents a functional local demo, but not a hosted public deployment. Full four-player deathmatch/reconnect/restart acceptance, load testing, a comprehensive mobile/accessibility audit and production service provisioning remain outstanding. AI narration is optional and has a deterministic fallback. These are release-validation items beyond the core pre-screening demonstration.
