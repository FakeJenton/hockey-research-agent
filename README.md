# Hockey Research Agent

A miniature hockey R&D data platform: a real pipeline from the public NHL API into BigQuery, dbt transformations with tests, and a Claude-powered research agent on top, deployed as a Next.js app on Vercel.

**Two core features:**

1. **Research Agent** — ask natural-language hockey questions; Claude translates them to SQL, runs it against the BigQuery warehouse via tool use, self-corrects on errors, and answers with the supporting data and the SQL it ran.
2. **Player Similarity Engine** — search any NHL skater and get the top 10 most statistically similar players, with a stat comparison view and an AI-generated scouting-style blurb.

> Status: Phase 0 (scaffold + API recon). Full README with architecture diagram, stack rationale, and setup instructions lands in Phase 5.

## Stack

Python 3.11 · BigQuery · dbt-core · Airflow (demonstration DAG) · Next.js + Tailwind on Vercel · Anthropic Messages API (tool use)

## Disclaimer

Uses publicly available NHL API data. Not affiliated with or endorsed by the NHL or any team.
