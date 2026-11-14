# Capability-aware enrichment

Status: implemented for enrichment research and the queue indicator.

## Problem

The enrichment indicator counts unfinished, due agent tasks linked to a contact
or company. The count includes tasks waiting for execution and tasks that have
exhausted their attempts. The label does not distinguish these states.

Research tasks need access to a model. A missing credential must not make those
tasks consume attempts. Direct tasks do not need a model and must remain available.

## Behavior before this change

- The model selection lives in `AppSetting`. `DEFAULT_AGENT_MODEL` is the fallback.
- AI Gateway accepts an API key or Vercel OIDC credentials. OIDC can come from
  request context, not only an environment variable.
- `capabilities.ts` describes external research sources. It does not report model
  access.
- `runResearchLane` calls `claimDue` before starting sessions. `claimDue` increments
  task attempts when it leases tasks.
- `DIRECT_KINDS` identifies tasks that run without a model. It includes more than
  brand and portrait tasks.
- The agent and API run separately. The API reaches the agent through an
  authenticated bridge.

## Implemented behavior

1. The agent owns a capability inventory. It reports model credential status
   separately from external sources. `DIRECT_KINDS` identifies model-free tasks.
2. Distinguish configured, unavailable, and unknown states. A credential or token
   alone does not prove a model request will succeed. Vercel without an environment
   credential reports unknown and does not pause the research lane.
3. Pause model-dependent research before `claimDue` when model access is known to
   be unavailable. Preserve queued tasks and their attempt counts.
4. Continue direct tasks independently. Apply each task's own provider requirements.
5. Expose capability status through an authenticated agent-to-API contract. Parse
   the response at the boundary. Never expose credentials to the client.
6. Show the queue indicator only when model access is configured. Continue polling
   so it appears when access is configured. An unreachable agent reports unknown;
   the hidden indicator does not imply missing credentials.
7. Resume pending research after access is configured. Preserve existing tasks.

## Verification requirements

- Missing model access does not claim research tasks or increment their attempts.
- Direct tasks continue without model access.
- API-key and Vercel OIDC authentication paths are covered, including request
  context and unknown availability.
- Bridge errors and invalid responses produce an unknown state without leaking
  credentials or breaking the queue.
- The indicator hides for unavailable and unknown model access. The queue
  distinguishes running, waiting, and failed tasks when it is visible.
- Restoring model access allows queued research to resume.

## Implementation anchors

- `apps/agent/agent/lib/capabilities.ts`: existing capability inventory.
- `apps/agent/agent/lib/dispatch.ts`: direct and research lanes.
- `apps/agent/agent/lib/tasks.ts`: task claim and attempt accounting.
- `apps/agent/agent/channels/crm.ts`: authenticated agent routes.
- `apps/api/src/enrichment/enrichment.service.ts`: queue data.
- `apps/app/components/enrichment-queue.tsx`: queue indicator and details.
