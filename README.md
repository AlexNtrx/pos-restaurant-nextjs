# Next POS frontend

This repository contains the Next.js App Router frontend for the restaurant
point-of-sale application. It talks to `next-pos-api` through the shared Axios
client in `lib/api.ts`.

## Requirements

- Node.js and npm
- A running `next-pos-api` instance
- `NEXT_PUBLIC_API_SERVER` pointing at the API host (defaults to
  `http://localhost:3001`)

## Run and verify

```bash
npm install
npm run dev
npm run test:pos
npm run test:report-contracts
npx tsc --noEmit --incremental false
npm run lint
npm run build
npm run format:check
```

Open `http://localhost:3000`. The `/signin` route creates the browser session;
backoffice authorization is enforced again by the backend.

## Structure

- `app/` — App Router pages, layouts, and route-local POS components/hooks
- `lib/` — API transport, session policy, and response contracts
- `test/` — frontend behavioral and contract tests

The current cross-repository contracts and security boundaries are documented
in [`docs/backend-handoff.md`](../docs/backend-handoff.md). Current workflow
status and the active roadmap are tracked in
[`docs/workflow-roadmap.md`](../docs/workflow-roadmap.md); product and design
decisions are in [`docs/plan-0.md`](../docs/plan-0.md), with detailed history
in [`docs/implementation-log.md`](../docs/implementation-log.md).
