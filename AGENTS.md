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
