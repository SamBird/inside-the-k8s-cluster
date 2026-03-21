# Post-Refactoring Review — End-to-End Testing Findings

Full stack boot, API workflow, SSE, frontend build, smoke test, and edge case testing performed 2026-03-21 against the refactored codebase (Rec 1–8 applied).

---

## Test results

### Full demo workflow — all 10 steps pass

Every action in the AGENTS.md demo sequence was exercised via curl and verified:

| Step | Action | Result |
|------|--------|--------|
| 1 | Baseline state (1 pod, v1, ready) | Pass |
| 2 | Scale 1→3 | Pass — 3 pods ready across 2 workers within 10s |
| 3 | Traffic x5 | Pass — all 3 pods receive requests, all v1 |
| 4 | Delete pod | Pass — replacement pod created, back to 3 within 8s |
| 5 | Break readiness | Pass — 1 pod NotReady within 10s |
| 6 | Traffic while broken | Pass — unready pod correctly bypassed |
| 7 | Restore readiness | Pass — all 3 ready within 10s |
| 8 | Rollout to v2 | Pass — returns immediately, all pods v2 within 20s |
| 9 | Traffic v2 | Pass — version=v2 confirmed |
| 10 | Reset to baseline | Pass — 1 pod, v1, ready within 35s |

### SSE stream — working, throttle confirmed

- 2 state events emitted over 15s during a scale operation (previously would have been ~8)
- Gap between emissions: ~3.1s, confirming the 2s `min_interval` throttle is active

### Frontend build — clean

- `npx tsc --noEmit`: zero errors
- `npx next build`: compiles successfully, only `/` and `/teaching` routes present
- No dead imports referencing removed graph/control-plane components

### Edge cases — all return clean 409 errors

| Edge case | Response |
|-----------|----------|
| Scale before deploy | 409: "Deployment not found. Run deploy action first." |
| Delete pod when none exist | 409: "No demo pods found to delete" |
| Rollout before deploy | 409: "Deployment not found. Run deploy action first." |
| Toggle readiness before deploy | 409: "Deployment not found. Run deploy action first." |
| Traffic when no service exists | 409: "Service 'demo-app' not found in namespace" |

No 500s, no crashes, no stack traces leaked.

---

## Bugs found and fixed

### 1. Smoke test `post_action` bash parameter expansion bug (critical)

**File:** `scripts/smoke-test.sh` line 28

**Bug:** `body="${3:-{}}"` — when `$3` is set (e.g., `{"replicas": 3}`), bash's `${3:-{}}` appends a trailing `}` because the `}` in the default value `{}` prematurely closes the parameter expansion. This produces `{"replicas": 3}}` — invalid JSON — causing HTTP 422 on every action that takes a request body.

**Impact:** 6 of 14 smoke test steps failed. `make smoke-test` was broken for every action with a body (scale, delete-pod, toggle-readiness, rollout). Deploy and reset worked only because they accept empty `{}` bodies where the double-brace accident still produced valid JSON.

**Fix:** Split the default into a separate variable:
```bash
local default_body='{}'
local body="${3:-$default_body}"
```

After fix: 14/14 smoke test steps pass.

### 2. Dead CSS from removed graph view (~45 lines)

**File:** `frontend/app/globals.css`

**Removed:** `.legend-live-blocked`, `.graph-layout`, `.graph-canvas-panel`, `.graph-side-panel`, `.graph-canvas`, `.cy-graph`, `.cy-graph .cytoscape-container`, `.graph-side-panel p`, `.graph-meta-list`, and associated media queries for `.graph-layout`, `.graph-canvas`, `.lineage-summary-grid`, `.lineage-layout`, `.lineage-history-row`.

Note: `.control-plane-grid` was NOT removed — it's still used by `ControlPlaneOverview.tsx` on the teaching page.

### 3. Stale `restart-rollout` endpoint in backend README

**File:** `backend/README.md`

Line 29 listed `POST /api/actions/restart-rollout` which was removed in Rec 4. Line 38 said "restart uses Deployment annotation patch" — updated to "reset uses" since the restart annotation is now only used internally by `reset_demo()`.

### 4. Stale graph/Cytoscape references in frontend README

**File:** `frontend/README.md`

Extensively referenced the graph view (Cytoscape, focus modes, edge labeling), 3-tab navigation, and endpoint details — all removed in Rec 5. Rewritten to reflect the 2-page layout (dashboard + teaching) with current panel descriptions.

### 5. Rehearsal check curled wrong URL for teaching content

**File:** `scripts/rehearsal-check.sh` line 92

`check_grep_url "${FRONTEND_URL}" "Control Plane Overview"` curled the root URL `/`, but "Control Plane Overview" only renders on `/teaching` (it's in `ControlPlaneOverview.tsx`). This check would always fail since Next.js SSR of `/` doesn't include the teaching page component.

**Fix:** Changed to `check_grep_url "${FRONTEND_URL}/teaching" "Control Plane Overview"`.

---

## Observations (no action required)

### Reset takes ~35s to fully settle

The `reset_demo()` action returns immediately and the UI updates via SSE. However, old pods from a previous scale-to-3 + rollout take 25-35 seconds to fully terminate. During this window, the API state shows more pods than the target replica count. This is normal Kubernetes behavior (graceful termination period) and the UI correctly shows pods disappearing. The presenter should wait for the pod list to settle before starting the next demo cycle.

### Rollout needs ~20s, not 15s

During the rollout to v2 test, 15 seconds wasn't quite enough — old v1 pods were still terminating alongside new v2 pods. By 20 seconds everything was clean. The smoke test's 15-second wait is sufficient because it only checks the config version (which updates immediately), not pod termination.

### Multiple old ReplicaSets accumulate

After several reset/rollout cycles, the deployment accumulates old ReplicaSets (each reset creates a new one via the restart annotation). After a full test run, 5-6 ReplicaSets were visible (all with replicas=0 except the active one). This is cosmetically noisy in the ownership panel but functionally harmless. A `golden-reset` via `make golden-reset` cleans this up by scaling to 0 and back.

### Action responses show stale replica counts

The `scale_deployment` action returns immediately. The response's `state.deployment.replicas` shows the pre-scale value (e.g., 1 instead of 3) because `get_state()` is called before the Kubernetes API has processed the scale patch. This is by design — SSE delivers the updated state within 2-4 seconds. The frontend handles this correctly via the SSE stream.
