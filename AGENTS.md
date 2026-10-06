# Frontend AGENTS.md

Follow `../AGENTS.md`.

- This repository contains the Next.js App Router frontend.
- Prefer Server Components; use Client Components only when required.
- Keep secrets and server-only logic out of Client Components.
- Use the shared API client in `lib/api.ts`; do not duplicate request configuration.
- Keep route-specific code local and preserve useful TypeScript types.
- Separate UI, state, data access, and reusable business logic where the existing structure supports it.
- Validate user input and important API response boundaries.
- Do not modify backend files during frontend-only work.
- Run the relevant tests, type checks, lint, build, and Prettier check for the change.
- Do not edit generated or vendored files unless explicitly required.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
