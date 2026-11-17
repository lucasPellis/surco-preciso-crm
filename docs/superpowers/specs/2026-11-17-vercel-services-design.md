# Vercel services deployment design

## Goal

Deploy the app, NestJS API, and eve agent as services in one Vercel project. Preserve local development and existing authentication, API, agent, and scheduled-job behavior.

## Services and routing

- `app` uses `apps/app` and receives the catch-all route.
- `api` uses `apps/api`. Public API routes retain their existing paths. Existing scheduled-job paths route to the API and retain their authorization checks.
- `agent` uses `apps/agent`. It has no public rewrite. Existing app routes proxy authorized agent requests.
- `packages/ui` is a shared package, not a service.

Choose the smallest public API route set that preserves browser, provider callback, tracking, and cron behavior. Check all overlapping Next.js routes before selecting rewrite order. Preserve the six schedules in `apps/api/vercel.json` in the combined deployment, without duplicate schedules.

## Bindings and URLs

- `app` binds to `api` and `agent`.
- `api` binds to `agent`.
- `agent` binds to `api`.

Use distinct internal URL variable names so public `API_URL` continues to define authentication and OAuth callback origins. Read bindings in server runtime code, not browser bundles, build configuration, or middleware. Keep existing local fallback URLs. Do not set Vercel-generated binding variables manually.

## Verification

Add focused tests for URL selection and routing configuration. Run relevant tests and type checks without running a build. Run `vercel dev` when the CLI and required local services are available. Check all cron routes, authentication callbacks, browser API calls, API-to-agent dispatch, app-to-agent proxy, and agent-to-API MCP token access. Report any checks that cannot run.

## Confirmation

Present the resulting root `vercel.json` and request explicit confirmation of service names, public and internal routing, and caller-to-target bindings before completion.
