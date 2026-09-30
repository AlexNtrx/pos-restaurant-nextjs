# Restaurant POS & KDS — Frontend

The Next.js frontend for restaurant counter sales, customer QR ordering, kitchen preparation, and waiter service. The interface primarily uses Finnish labels.

- [Backend repository](https://github.com/AlexNtrx/pos-restaurant-backend)
- [Frontend v2.0.0 release](https://github.com/AlexNtrx/pos-restaurant-nextjs/releases/tag/v2.0.0)
- [Backend v2.0.0 release](https://github.com/AlexNtrx/pos-restaurant-backend/releases/tag/v2.0.0)

## Release status

`v2.0.0` is a published source release. Project records include checks and browser verification for multiple workflows against a disposable test database. Production deployment checks and pilot acceptance remain outstanding.

## Features

- Counter dine-in and takeaway checkout, pickup numbers, receipt previews, and receipt reprinting.
- Browser draft carts scoped to the signed-in staff member and table or takeaway, with server-derived quotes.
- Customer QR menu, sizes and modifiers, notes, cart, submission, and order tracking.
- Table sessions, QR modes, staff order inbox, and table-session settlement.
- Kitchen board for confirmed, preparing, and ready orders.
- Waiter table ordering, serving confirmation, and customer service calls.
- Catalog and staff management, restaurant settings, operational dashboard, order history, receipt history, and sales reports.

The backend verifies permissions, prices, totals, and order transitions. Frontend route guards are interface controls.

## Stack and requirements

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI, Axios, and Vitest. Exact dependency versions are recorded in `package-lock.json`.

You need Node.js and npm compatible with the installed dependencies, a running backend, and an existing active staff account. This repository does not provision accounts or a database.

## Local development

```bash
git clone https://github.com/AlexNtrx/pos-restaurant-nextjs.git
cd pos-restaurant-nextjs
npm ci
```

To use the published source, run `git checkout v2.0.0` before installing dependencies.

Create `.env.local` in the repository root:

```dotenv
NEXT_PUBLIC_API_SERVER=http://localhost:3001
```

Start the backend using its README, then run:

```bash
npm run dev
```

Open [http://localhost:3000/signin](http://localhost:3000/signin) and sign in with an existing staff account.

## Configuration

| Variable                          | Purpose                                                                                                     | Default                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_SERVER`          | Backend origin without `/api`; the shared client appends `/api`                                             | `http://localhost:3001`        |
| `NEXT_PUBLIC_ORD02_DRAFT_ENABLED` | Set to `false` to use legacy SaleTemp carts for dine-in; saved drafts remain and takeaway still uses drafts | Enabled unless exactly `false` |

Public environment values are embedded in browser assets at build time. Rebuild after changing them and never put secrets in `NEXT_PUBLIC_*` variables.

## Main routes

| Route                               | Purpose                                                          | Access                                      |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| `/signin`                           | Staff sign-in                                                    | Public                                      |
| `/backoffice/dashboard`             | Operational overview                                             | Admin                                       |
| `/backoffice/orders/new`            | Counter checkout                                                 | Admin, user                                 |
| `/backoffice/orders/inbox`          | Incoming orders                                                  | Admin, user                                 |
| `/backoffice/kitchen`               | Kitchen board                                                    | Admin, user                                 |
| `/backoffice/waiter`                | Table orders, serving, service calls                             | Admin, user, waiter                         |
| `/backoffice/orders/history/orders` | Order lifecycle history                                          | Admin                                       |
| `/backoffice/orders/history`        | Receipt history                                                  | Admin                                       |
| `/backoffice/catalog/menu-items`    | Menu management                                                  | Admin                                       |
| `/backoffice/settings/tables`       | Tables and sessions                                              | Admin, user; actions depend on role |
| `/backoffice/reports/daily-sales`   | Daily report                                                     | Admin                                       |
| `/backoffice/reports/monthly-sales` | Monthly report                                                   | Admin                                       |
| `/order/[tableToken]`               | Customer menu, with nested cart, confirmation, and status routes | Valid table QR token                        |

QR links come from staff table-session operations. Backend authorization also applies to each protected action.

## Development checks

Run from the repository root:

```bash
npx vitest run
npm run test:report-contracts
npm run test:release-config
npx tsc --noEmit --incremental false
npm run lint
npm run build
npm run format:check
```

Focused scripts include `test:pos`, `test:ui`, and `test:shell`. Component and contract tests do not replace browser verification against a running backend.

## Release build

Set `NEXT_PUBLIC_API_SERVER` in the build environment to the real HTTPS backend origin, then run:

```bash
npm run release:check
npm run build:release
npm run start
```

The guard rejects missing, non-HTTPS, loopback, or malformed origins and URLs containing credentials, paths, queries, or fragments. It does not verify DNS, TLS, CORS, or API reachability. `npm run build` remains available for local production-style testing with a local API.

Deploy a compatible backend with required migrations applied before enabling customer ordering. Begin with QR disabled, verify menu-only access, and enable ordering for a limited pilot after deployment checks pass.

## Project structure

| Directory     | Responsibility                                              |
| ------------- | ----------------------------------------------------------- |
| `app/`        | App Router pages, layouts, and route-local components/hooks |
| `components/` | Shared UI and order components                              |
| `lib/`        | API clients, session policy, access rules, and contracts    |
| `scripts/`    | Release API-origin validation and build wrapper             |
| `test/`       | Component, behavioral, and contract tests                   |

## Limits and troubleshooting

- Draft carts stay in the browser and do not sync between devices.
- Order and kitchen updates use polling; realtime delivery is not implemented.
- Table-session payment is one bill per session; split or partial payment is not supported.
- Customer accounts, online payment, delivery, inventory, reservations, and loyalty are outside the implemented scope.
- If sign-in or requests fail, check the backend, configured origin, browser network response, and active account. A `401` clears the session and redirects to sign-in.
- If QR access fails, check the session, QR mode, token expiry, and backend QR secret configuration.

## Workspace documentation

The combined development workspace maintains `docs/workflow-roadmap.md` for status, `docs/backend-handoff.md` for API contracts, `docs/plan-0.md` for product/design decisions, and `docs/implementation-log.md` for verified history. Those files are outside this standalone repository and are not included by cloning it alone. The linked release notes provide the public version summary.
