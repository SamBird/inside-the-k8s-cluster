# RECOMMENDATIONS.md

Staff Engineer review of the **inside-the-k8s-cluster** demo project.

Goal: simplify the UI, make every flow reliable first-time, and keep the application fit for purpose as a training demo.

---

## Summary of findings

### What works well
- AGENTS.md is excellent — clear priorities, good guardrails
- Backend API is focused and namespace-scoped
- The 3-stage ActionControls layout tells a clear story (Set up → Create drift → Prove behavior)
- The DesiredActualPanel is the single most valuable teaching component
- The demo-app workload is simple and purpose-built
- Makefile + scripts give a one-command setup
- Backend has good error detection (ImagePullBackOff, CrashLoopBackOff) with actionable error messages

### Critical reliability concerns (why flows feel unreliable)

1. **Blocking backend endpoints freeze the UI for up to 75 seconds.** `rollout_version()` calls `_wait_for_rollout()` which polls Kubernetes in a `while` loop with `time.sleep(2)` for up to 75 seconds. `toggle_readiness_failure()` blocks for up to 20 seconds. During this time, the frontend `fetch()` is waiting, `busyAction` locks ALL buttons, and the presenter sees a frozen spinner. This is the single biggest reliability risk — a slow rollout makes it look like the demo is broken.

2. **No frontend timeout on API calls.** `requestJson` in `api.ts` has no `AbortController` or timeout. If the backend hangs (slow Kubernetes API, network hiccup), the UI is stuck forever with no recovery path except a browser refresh.

3. **`busyAction` has no escape hatch.** If an action fails or hangs, all buttons stay disabled. The presenter cannot cancel or retry. On stage, this means a dead UI until the backend responds or the browser is refreshed.

4. **SSE amplification during scaling/rollout.** The `sse_state_stream` fires a full `get_state()` (7 Kubernetes API calls) on every pod watch event. During scale 1→3, the watch fires ~8 events, triggering ~56 Kubernetes API calls in rapid succession. This creates backend latency spikes that can delay action responses.

5. **Event Timeline floods with SSE noise.** `diffState` generates individual events for every pod phase transition. During scaling, this produces 6-8 timeline entries that push the meaningful "Scale to 3" action event off screen.

6. **Rollout fallback hack is fragile.** The frontend catches 404 on `/api/actions/rollout` and falls back to `/api/actions/restart-rollout`. Defensive code like this means the API surface isn't stable.

### UI clutter concerns

7. **4 pages with navigation overhead.** The `/teaching`, `/graph`, and `/control-plane` views split attention. Switching tabs mid-demo breaks flow. The graph view (Cytoscape) is particularly high-risk — graph layouts are fragile on projectors and re-layout on pod changes creates visual noise.

8. **Dashboard has 7 panels.** Summary strip, action controls, desired vs actual, topology, workload lineage, traffic, event timeline. The audience can't focus on what matters.

9. **Traffic panel has too many knobs.** Request count, delay (ms), and a 7-column table of raw responses. For a demo, you just need "send traffic, show which pods responded."

10. **WorkloadResourcesPanel is too verbose** (not wrong — too detailed). Orphan pods, inactive ReplicaSets with revision history, and verbose metadata clutter the view. The Deployment → ReplicaSet → Pod ownership chain IS essential for the teaching story ("What Really Happens After You Apply YAML"), but it needs to be simpler.

---

## Recommendations with Claude Code prompts

Ordered by impact on reliability first, then UI simplification. Each prompt is ready to copy into Claude Code.

---

### Recommendation 1: Fix the blocking rollout and readiness endpoints

**Why:** This is the #1 reliability risk. The `rollout_version()` endpoint blocks for up to 75 seconds and `toggle_readiness_failure()` blocks for up to 20 seconds. During this time, the frontend shows a frozen spinner and all buttons are locked. A slow rollout makes it look like the demo is broken. For a demo that must work first time, the presenter needs to see progress, not a frozen UI.

**Prompt:**
```
The backend has blocking action endpoints that freeze the UI. Fix this by making actions return immediately and letting SSE deliver progress.

In backend/app/k8s_service.py:

1. In rollout_version(): Remove the call to self._wait_for_rollout(version, timeout_seconds=75). Instead, after patching the configmap and deployment, immediately call self.get_state() and return the ActionResponse. The SSE stream already watches pods and will push state updates as the rollout progresses. The frontend will see pods transitioning through the SSE channel.

2. In toggle_readiness_failure(): Remove the call to self._wait_for_expected_pod_readiness(expected_by_pod). After calling self._set_expected_pod_readiness(expected_by_pod), immediately return with the current state. Also remove the try/except that calls _restore_previous_pod_readiness on failure — if the proxy call fails, just raise the error immediately.

3. Remove these now-unused methods:
   - _wait_for_rollout
   - _deployment_is_ready
   - _rollout_failure_reason
   - _wait_for_expected_pod_readiness
   - _restore_previous_pod_readiness
   - _choose_readiness_failure_target (simplify toggle_readiness_failure to just pick the first ready pod for fail=true, or restore all for fail=false)

4. Simplify toggle_readiness_failure to:
   - If fail=True: find the first ready running pod, call _proxy_pod_readiness_change(pod_name, fail=True), return immediately
   - If fail=False: for all running pods, call _proxy_pod_readiness_change(pod_name, fail=False), return immediately
   - Remove the complex previous_by_pod / expected_by_pod state tracking

The key insight: Kubernetes reconciliation IS the demo. The presenter WANTS to see pods transitioning through Pending → Running → Ready via the SSE-driven UI. Blocking until completion hides the very behaviour the demo exists to show.

Validate: run `cd backend && python -c "from app.main import app; print('OK')"` to confirm the backend still starts.
```

---

### Recommendation 2: Add frontend action timeout and busyAction escape hatch

**Why:** If the backend is slow or hangs, the UI is stuck forever with all buttons disabled. The presenter has no recovery except refreshing the browser. For a live demo, there must always be a way to recover.

**Prompt:**
```
Add a timeout to API calls and an escape hatch for the busyAction lock.

1. In frontend/lib/api.ts, add a timeout to requestJson using AbortController:

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const response = await fetch(backendUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });

    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      throw new ApiError(response.status, readErrorMessage(parsed));
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(408, "Request timed out after 15 seconds. The backend may be slow — try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

2. In frontend/app/page.tsx, add a safety timeout to the runAction function. After 20 seconds, automatically clear busyAction so buttons are re-enabled:

In the runAction function, add a safety timer:
- Set a timeout at the start: const safetyTimeout = setTimeout(() => setBusyAction(null), 20000);
- Clear it in the finally block: clearTimeout(safetyTimeout);

3. In the ActionControls component, when busyAction is set, show a small "Cancel" text button next to the spinner that calls a new onCancelAction prop. In page.tsx, wire this to simply setBusyAction(null). This doesn't abort the backend call, but it unlocks the UI so the presenter can continue.

Validate: run `cd frontend && npx tsc --noEmit` to confirm no type errors.
```

---

### Recommendation 3: Throttle SSE state fetches to prevent backend overload

**Why:** The SSE stream calls `get_state()` (7 Kubernetes API calls) on every pod watch event. During scaling or rollout, this creates a burst of 40-60 Kubernetes API calls in seconds. This can cause latency spikes that delay action responses and make the UI feel sluggish.

**Prompt:**
```
Throttle the SSE state stream to prevent backend overload during rapid pod changes.

In backend/app/k8s_service.py, modify the sse_state_stream method:

1. Add a minimum interval between state emissions. After emitting a state event, skip subsequent watch events that arrive within 2 seconds. This means during a scale-to-3, instead of 8 state fetches in rapid succession, you get 2-3 spaced state fetches that still show progression.

Replace the inner loop of sse_state_stream with:

    last_emit = 0.0
    min_interval = 2.0  # seconds between state emissions

    while True:
        watcher = watch.Watch()
        try:
            stream = watcher.stream(
                self.core.list_namespaced_pod,
                namespace=self.cfg.namespace,
                label_selector=self.cfg.app_label,
                timeout_seconds=self.cfg.sse_watch_timeout_seconds,
            )
            for _ in stream:
                now = time.time()
                if now - last_emit < min_interval:
                    continue
                payload = {"state": jsonable_encoder(self.get_state())}
                yield self._format_sse("state", payload)
                last_emit = now
        except ApiException as exc:
            payload = {"message": f"kubernetes_api_error status={exc.status}"}
            yield self._format_sse("error", payload)
            time.sleep(1)
        except Exception as exc:
            payload = {"message": f"stream_error {type(exc).__name__}: {exc}"}
            yield self._format_sse("error", payload)
            time.sleep(1)
        finally:
            watcher.stop()

        # Emit one final state after the watch timeout so the UI is up to date
        payload = {"state": jsonable_encoder(self.get_state())}
        yield self._format_sse("state", payload)
        last_emit = time.time()

This preserves real-time feel (2s max lag) while reducing Kubernetes API load by ~75% during burst events.

Validate: run `cd backend && python -c "from app.main import app; print('OK')"` to confirm the backend still starts.
```

---

### Recommendation 4: Remove the rollout fallback hack

**Why:** The frontend catches 404 on `/api/actions/rollout` and falls back to `/api/actions/restart-rollout`. The backend HAS a working `/api/actions/rollout` endpoint. The fallback is dead code that adds confusion. For a demo that must work first time, there should be one code path.

**Prompt:**
```
Clean up the rollout action to use a single reliable code path.

1. In frontend/app/page.tsx, simplify the onRollout handler. Remove the try/catch that detects ApiError with status 404 and falls back to restartRollout(). Replace the entire onRollout callback with:

onRollout={() => {
  const tag = rolloutTag.trim();
  if (!tag) {
    setTimeline((existing) => prependTimeline(existing, [newTimeline("warn", "Rollout tag is required")]));
    return;
  }
  runAction(`Rollout ${tag}`, () => rolloutVersion(tag), { deployed: true, version: tag });
}}

2. In frontend/lib/api.ts, remove the restartRollout function entirely.

3. In backend/app/main.py, remove the /api/actions/restart-rollout endpoint.

4. In backend/app/k8s_service.py, remove the restart_rollout method. Note: reset_demo() calls self.restart_rollout() — replace that call with an inline restart annotation patch:

In reset_demo(), replace `self.restart_rollout()` with:
    ts = datetime.now(timezone.utc).isoformat()
    self.apps.patch_namespaced_deployment(
        name=self.cfg.deployment_name,
        namespace=self.cfg.namespace,
        body={
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": ts,
                        }
                    }
                }
            }
        },
    )

Validate: run `cd frontend && npx tsc --noEmit` and `cd backend && python -c "from app.main import app; print('OK')"`.
```

---

### Recommendation 5: Reduce from 4 pages to 2 — remove Graph and Control-Plane views

**Why:** The Graph view (Cytoscape) is the highest-risk UI component for a live demo — graph layouts are fragile on projectors, dynamic re-layout when pods change causes visual noise, and it duplicates what the topology and lineage panels already show more simply. The Control-Plane Inspector polls kube-system pods every 5 seconds for information the presenter can narrate verbally.

Keep the Teaching view — its step-by-step explained flows are valuable educational scaffolding for a training session. The presenter can use it before or between demo stages to explain "what just happened behind the scenes."

**Prompt:**
```
Remove the Graph view and Control-Plane Inspector. Keep the Teaching view. Reduce navigation from 4 to 2 pages.

Delete these files:
- frontend/app/graph/page.tsx
- frontend/app/control-plane/page.tsx
- frontend/components/ControlPlaneInspector.tsx
- frontend/lib/clusterGraph.ts

In frontend/components/PageNav.tsx, remove the "Graph View" and "Control Plane" nav links. Keep only "Live Demo" (/) and "Teaching View" (/teaching). Simplify the type:
interface PageNavProps {
  current: "dashboard" | "teaching";
}

In frontend/lib/api.ts, remove the getControlPlaneState function.

In frontend/lib/types.ts, remove the ControlPlaneState type and any related types (ControlPlaneComponentState, ControlPlaneLeaseState) if they exist.

In backend/app/main.py, remove the /api/control-plane endpoint.

In backend/app/k8s_service.py, remove the get_control_plane_state method and all the helper methods it uses (_find_control_plane_pod, _find_component_lease). Also remove the CONTROL_PLANE_COMPONENTS tuple, the LEASE_NAME_BY_COMPONENT dict, and the ControlPlaneComponentState/ControlPlaneLeaseState/ControlPlaneState imports if they are no longer used. Remove the CoordinationV1Api client from __init__ and _ensure_clients and _reset_clients.

In backend/app/models.py, remove the ControlPlaneState, ControlPlaneComponentState, and ControlPlaneLeaseState model classes. Remove the ControlPlaneState import from main.py.

Remove the cytoscape, elkjs, and @xyflow/react dependencies from frontend/package.json (run `cd frontend && npm uninstall cytoscape elkjs @xyflow/react`).

Do NOT change the Teaching view page or its components (ControlPlaneOverview.tsx, ExplainedFlowPanel.tsx, explainedFlow.ts) — they stay.

Validate: run `cd frontend && npx tsc --noEmit` to confirm no type errors after the removals.
```

---

### Recommendation 6: Simplify the WorkloadResourcesPanel (don't remove it)

**Why:** I initially recommended removing this panel. That was wrong. The Deployment → ReplicaSet → Pod ownership chain is THE visual answer to the talk's central question: "What Really Happens After You Apply YAML." The TopologyView shows WHERE pods run (node placement). The WorkloadResourcesPanel shows WHY pods exist (ownership chain). During a rollout, seeing two ReplicaSets with their pods is essential for the teaching story. However, the current implementation is too verbose for a projected demo.

**Prompt:**
```
Simplify the WorkloadResourcesPanel to show a clean ownership chain without the verbose extras.

In frontend/components/WorkloadResourcesPanel.tsx:

1. Remove the "Lineage Summary Grid" (the 4 summary cards at the top for Deployment, ReplicaSets, Pods, Service Endpoints). This information is already in DesiredActualPanel and TopologyView. The lineage panel should ONLY show the ownership tree.

2. Remove the "Older ReplicaSets" section (inactiveReplicaSets). During a demo, old ReplicaSets are noise. The presenter can explain rollout history verbally. Remove the inactiveReplicaSets variable and the associated JSX block.

3. Remove the "Orphan Pods" section. Orphan pods are an edge case that never appears in the happy-path demo. Remove the orphanPods variable and the associated JSX block.

4. Remove the "Service Endpoint Set" section (the second lineage-card). Endpoint information is visible in the pod readiness badges and the DesiredActualPanel. This section adds a lot of visual weight for information that's already shown elsewhere.

5. Simplify the pod display within each ReplicaSet: show just the pod name, a Ready/NotReady badge, and the node name. Remove the phase badge (it's redundant with Ready/NotReady for the demo) and the restart count. Remove the image display per pod (the ReplicaSet already shows the image).

6. Keep the ownership arrows ("owns", "creates") — they're the key visual teaching element.

The result should be a clean, compact tree:
  Deployment (demo-app) → owns → ReplicaSet (demo-app-abc) running image demo-app:v1
    → creates → [Pod: demo-app-abc-1 Ready on worker-1] [Pod: demo-app-abc-2 Ready on worker-2]

Validate: run `cd frontend && npx tsc --noEmit` to confirm no type errors.
```

---

### Recommendation 7: Simplify the Traffic Panel

**Why:** The Traffic panel exposes request count and delay (ms) knobs plus a 7-column table of raw responses. The presenter needs to demonstrate load balancing, not tune traffic parameters. The raw table is unreadable from a projector.

**Prompt:**
```
Simplify the TrafficPanel to be demo-focused with a clear visual result.

In frontend/components/TrafficPanel.tsx:

1. Remove the "Delay (ms)" input control. Remove the onDelayChange prop from the interface. Keep the "Requests" count input — the presenter may want to adjust between 5 and 20 requests for different demo stages (e.g., fewer for quick check, more for load balancing demonstration).

2. Replace the 7-column table with a pod distribution summary. After traffic completes, show:
   - A row of "pod pills" showing each pod that received traffic and how many requests it got, e.g.:
     [demo-app-abc12: 6 requests ✓] [demo-app-def34: 4 requests ✓]
   - If a pod is not ready, show its pill in a warning color
   - A single summary line: "10/10 successful" or "8/10 successful, 2 failed"
   - Pod pills should be large enough to read from a projector (at least 1rem font)

3. Add a "Clear" button next to "Generate Traffic" that resets the results. Wire it to a new onClear prop. Only show it when there are existing events.

4. Remove the trafficTarget display ("Backend proxy -> /api/traffic/info -> service/demo-app") — it's implementation detail the audience doesn't need.

5. Keep the "Generate Traffic" button and spinner state.

Update frontend/app/page.tsx:
- Remove trafficDelayMs state variable
- Remove the onDelayChange prop from TrafficPanel
- Hardcode the delay to 150ms in the onGenerateTraffic loop
- Add onClear={() => setTrafficEvents([])} prop to TrafficPanel
- Remove the trafficTargetLabel constant

Validate: run `cd frontend && npx tsc --noEmit` to confirm no type errors.
```

---

### Recommendation 8: Cap the Event Timeline and reduce SSE noise

**Why:** The timeline grows to 120 entries with SSE-driven state diffs. During a scale-to-3, you get ~8 state diff entries (pod created, ready count changed, pod created, ready count changed...) that push the meaningful "Scale to 3" action event off screen. The presenter and audience lose track of the narrative.

**Prompt:**
```
Make the Event Timeline compact and narrative-focused.

1. In frontend/lib/stateDiff.ts, reduce the noise from diffState. Instead of emitting individual events for each change, batch them into a single summary event when multiple changes occur in one diff. Replace the diffState function body:

If more than 2 events would be generated, collapse them into a single event:
- Count the changes: pods added, pods removed, readiness changes, config changes
- Emit one event like: "Cluster updated: 2 pods created, ready count 1→3"
- For single changes (e.g., one pod readiness flip), keep the individual event as-is

This means during a scale-to-3, instead of 8 separate timeline entries, you get 2-3 summary entries that are actually readable.

2. In frontend/lib/stateDiff.ts, reduce the maxItems parameter in prependTimeline from 120 to 20.

3. In the EventTimeline component (frontend/components/EventTimeline.tsx), add a visual distinction between action events and background state events. Action events (level "success" from runAction) should render with a slightly bolder style (font-weight 600) than info/state events. This helps the audience follow the presenter's narrative thread through the background noise.

4. Remove the "Newest first" label from the panel header — it's obvious and wastes header space.

Validate: run `cd frontend && npx tsc --noEmit` to confirm no type errors.
```

---

### Recommendation 9: Simplify the summary strip

**Why:** The summary strip shows 4 cards (Pods Ready, Workers, Version, Drift). The "Workers" card is static (always 2 for the kind cluster — it never changes during the demo). Reducing to 3 cards with larger text improves projector readability.

**Prompt:**
```
Simplify the summary strip at the top of the dashboard.

In frontend/app/page.tsx, reduce the summary strip from 4 cards to 3:

1. "Pods" — show ready/total (e.g., "3/3") with subtitle showing version (e.g., "Running v1") and attention signals if any pods are failing
2. "Drift" — show drift count with subtitle "In sync" or "Reconciling..."
3. "Cluster" — show the cluster health label (e.g., "Demo healthy" / "Attention needed") with subtitle showing connection state

Remove the "Workers" card — it's always "2" and never changes during the demo.

In frontend/app/globals.css, increase the font size of .summary-card strong to at least 2rem and .summary-label to at least 0.9rem so the numbers are readable from the back of a conference room.

Validate: run `cd frontend && npx tsc --noEmit` to confirm no type errors.
```

---

### Recommendation 10: Add error boundaries to prevent white-screen failures

**Why:** If any panel throws a React error during a live demo, the entire page goes white. This is a catastrophic failure mode for a presenter. Each panel should fail independently.

**Prompt:**
```
Add a simple React error boundary component that wraps each panel on the dashboard.

1. Create frontend/components/PanelErrorBoundary.tsx — a class component error boundary that:
   - Catches errors in its children
   - Renders a small fallback: a panel-shaped div with the text "This panel hit an error. The demo can continue." and a "Retry" button that resets the error state
   - Logs the error to console.error for debugging
   - Accepts a "label" prop so the fallback can say which panel failed

2. In frontend/app/page.tsx, wrap each panel section (ActionControls, DesiredActualPanel, TopologyView, WorkloadResourcesPanel, TrafficPanel, EventTimeline) in a <PanelErrorBoundary label="Panel Name"> component.

Keep it simple — no error reporting services, no fancy UI. Just prevent a white screen.

Validate: run `cd frontend && npx tsc --noEmit` to confirm no type errors.
```

---

### Recommendation 11: CSS cleanup for projector readability

**Why:** After removing the graph view and control-plane inspector, there will be dead CSS. More importantly, the AGENTS.md calls for "readable from a distance, high contrast, low clutter."

**Prompt:**
```
Clean up CSS for projector readability after the component removals.

In frontend/app/globals.css:

1. Remove all CSS rules for removed components:
   - .graph-* classes (graph view)
   - .cy-graph (Cytoscape container)
   - .legend-* classes (graph legend)
   - .focus-chip* classes (graph focus mode)
   - Any styles specific to ControlPlaneInspector

2. Increase base readability for projection:
   - Body font-size: at least 16px
   - .panel h2: at least 1.3rem
   - .action-button font-size: at least 1rem
   - .summary-card strong: at least 2.2rem
   - Table text (th, td): at least 0.95rem
   - .pod-chip strong and .lineage-step-card strong: at least 0.95rem

3. Ensure high contrast:
   - Status badge colors: green (#16a34a) for ok, amber (#d97706) for warn, red (#dc2626) for bad
   - All body text at least 4.5:1 contrast ratio against background

4. Remove any transition/animation rules that could cause visual jitter on a projector. Keep only the inline-spinner keyframe.

Do NOT change the layout grid or panel structure — just clean dead CSS and improve readability.

Validate: run `cd frontend && npm run build` to confirm the build succeeds.
```

---

### Recommendation 12: Add a pre-demo smoke test script

**Why:** The presenter needs confidence that every action works before going on stage. An automated smoke test that exercises the full demo flow catches issues that a manual check might miss.

**Prompt:**
```
Create a script at scripts/smoke-test.sh that exercises every demo action in sequence against the running backend.

The script should:
1. Check backend health: GET /healthz
2. Get initial state: GET /api/state
3. Deploy app: POST /api/actions/deploy
4. Wait 8 seconds for pods to be ready
5. Get state and verify deployment exists with ready pods: GET /api/state
6. Scale to 3: POST /api/actions/scale with {"replicas": 3}
7. Wait 10 seconds for all pods to be ready
8. Generate traffic: GET /api/traffic/info (call 3 times, verify 200 responses)
9. Delete a pod: POST /api/actions/delete-pod (with empty body so it picks oldest)
10. Wait 8 seconds for replacement
11. Break readiness: POST /api/actions/toggle-readiness with {"fail": true}
12. Wait 5 seconds
13. Restore readiness: POST /api/actions/toggle-readiness with {"fail": false}
14. Wait 5 seconds
15. Rollout to v2: POST /api/actions/rollout with {"version": "v2"}
16. Wait 15 seconds for rollout to complete
17. Get state and verify version is v2: GET /api/state
18. Reset: POST /api/actions/reset
19. Wait 10 seconds
20. Get state and verify deployment exists, replicas target is 1: GET /api/state

Each step should print a line: [PASS] Step name or [FAIL] Step name: reason
If any step fails, continue running all steps but exit with code 1 at the end.

Use curl with -s flags. Backend URL should default to http://localhost:8000 but accept BACKEND_URL env var.

Important: Before step 15 (rollout to v2), check if the demo-app:v2 image exists in the kind cluster with `docker exec inside-k8s-control-plane crictl images | grep demo-app | grep v2`. If missing, print [SKIP] for the rollout step with a message telling the user to run `make demo-image VERSION=v2 && make demo-load VERSION=v2`.

Add a `smoke-test` target to the Makefile that runs this script.
Make the script executable with chmod +x.

Validate: run `bash -n scripts/smoke-test.sh` to check syntax.
```

---

## Execution order

Apply in this order to minimize breakage and maximise reliability improvement first:

| Order | Rec | What | Risk |
|-------|-----|------|------|
| 1 | **Rec 4** | Remove rollout fallback hack | Small, safe cleanup |
| 2 | **Rec 1** | Fix blocking backend endpoints | High-impact reliability fix |
| 3 | **Rec 2** | Add frontend timeout + escape hatch | High-impact reliability fix |
| 4 | **Rec 3** | Throttle SSE state fetches | Reliability improvement |
| 5 | **Rec 5** | Remove graph + control-plane views | Structural simplification |
| 6 | **Rec 6** | Simplify WorkloadResourcesPanel | UI declutter |
| 7 | **Rec 7** | Simplify Traffic Panel | UI declutter |
| 8 | **Rec 8** | Cap Event Timeline | UI declutter |
| 9 | **Rec 9** | Simplify summary strip | UI polish |
| 10 | **Rec 11** | CSS cleanup | Do after all component changes |
| 11 | **Rec 10** | Error boundaries | Do after layout is stable |
| 12 | **Rec 12** | Smoke test | Do last, validates everything |

---

## Things I would NOT change

- **The 3-stage ActionControls** — the progression "Set up → Create drift → Prove behavior" is well-designed and tells the right story.
- **The DesiredActualPanel** — this is the most valuable teaching component. It makes the desired-vs-actual-state concept concrete and visible.
- **The TopologyView** — simple, clear, shows pod placement per node. Right for a demo.
- **The Teaching view and ExplainedFlowPanel** — the 7 step-by-step scenarios are valuable training scaffolding. The presenter can use this page before or between demo stages to explain "what just happened behind the scenes."
- **The backend API surface** (after Rec 1+4 cleanup) — focused, namespace-scoped, one endpoint per action.
- **The demo-app workload** — simple, purpose-built, does exactly what it needs to.
- **The Makefile + scripts** — one-command setup is the right approach.

---

## Corrections from initial review

For transparency, my first-pass review had two mistakes worth noting:

1. **I initially recommended removing the WorkloadResourcesPanel entirely.** This was wrong. The Deployment → ReplicaSet → Pod ownership chain is the core visual answer to the talk's title question. The TopologyView shows WHERE pods run; the lineage panel shows WHY they exist. Both dimensions are needed. The fix is to simplify it, not remove it.

2. **I initially recommended removing the Teaching view.** For a training session (not just a quick conference talk), the step-by-step explained flows are valuable educational scaffolding. The fix is to remove only the high-risk views (Graph, Control-Plane Inspector) and keep the Teaching view as a reference page.
