"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ActionControls } from "../components/ActionControls";
import { DesiredActualPanel } from "../components/DesiredActualPanel";
import { EventTimeline } from "../components/EventTimeline";
import { PageNav } from "../components/PageNav";
import { PageHero } from "../components/PageHero";
import { TopologyView } from "../components/TopologyView";
import { TrafficPanel } from "../components/TrafficPanel";
import { WorkloadResourcesPanel } from "../components/WorkloadResourcesPanel";
import {
  deletePod,
  deployApp,
  getTrafficInfo,
  getState,
  resetDemo,
  rolloutVersion,
  scaleDeployment,
  subscribeToState,
  toggleReadiness
} from "../lib/api";
import { diffState, prependTimeline } from "../lib/stateDiff";
import {
  ActionResponse,
  ClusterState,
  ConnectionState,
  DemoTrafficResponse,
  DesiredState,
  TimelineEvent,
  TrafficEvent
} from "../lib/types";

const maxTrafficRows = 500;

const defaultDesired: DesiredState = {
  deployed: false,
  replicas: 1,
  version: "v1",
  readinessHealthy: true
};

const resetDesired: DesiredState = {
  deployed: true,
  replicas: 1,
  version: "v1",
  readinessHealthy: true
};

function desiredFromActual(state: ClusterState): DesiredState {
  return {
    deployed: state.deployment.exists,
    replicas: state.deployment.replicas || 1,
    version: state.config?.app_version ?? "v1",
    readinessHealthy: state.config?.initial_readiness ?? true
  };
}

function newTimeline(level: TimelineEvent["level"], title: string, detail?: string): TimelineEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    level,
    title,
    detail
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTimestamp(value?: string | null): string {
  return value ? new Date(value).toLocaleTimeString() : "n/a";
}

export default function DashboardPage() {
  const [state, setState] = useState<ClusterState | null>(null);
  const [desired, setDesired] = useState<DesiredState>(defaultDesired);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [selectedPod, setSelectedPod] = useState<string>("");
  const [rolloutTag, setRolloutTag] = useState<string>("v2");
  const [trafficCount, setTrafficCount] = useState<number>(12);
  const [trafficRunning, setTrafficRunning] = useState<boolean>(false);
  const [trafficEvents, setTrafficEvents] = useState<TrafficEvent[]>([]);

  const previousStateRef = useRef<ClusterState | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const initial = await getState();
        if (cancelled) {
          return;
        }
        previousStateRef.current = initial;
        setState(initial);
        setDesired(desiredFromActual(initial));
        setConnection("live");
        setTimeline((existing) => prependTimeline(existing, [newTimeline("success", "Initial state loaded")]));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setConnection("degraded");
        setTimeline((existing) =>
          prependTimeline(existing, [newTimeline("error", "Initial state fetch failed", String(error))])
        );
      }
    };

    bootstrap();

    const unsubscribe = subscribeToState({
      onState: (incoming) => {
        setConnection("live");
        setState(incoming);
        const diffEvents = diffState(previousStateRef.current, incoming);
        previousStateRef.current = incoming;
        if (diffEvents.length > 0) {
          setTimeline((existing) => prependTimeline(existing, diffEvents));
        }
      },
      onError: (message) => {
        setConnection("degraded");
        setTimeline((existing) => prependTimeline(existing, [newTimeline("warn", "SSE notice", message)]));
      },
      onOpen: () => {
        setConnection("live");
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const podOptions = useMemo(() => state?.pods.map((pod) => pod.name) ?? [], [state?.pods]);
  const readyPods = state?.pods.filter((pod) => pod.ready).length ?? 0;
  const failingPods = state?.pods.filter((pod) => !pod.ready).length ?? 0;
  const workerCount = state?.nodes.filter((node) => node.role !== "control-plane").length ?? 0;
  const expectedReadyPods = desired.deployed ? desired.replicas : 0;
  const driftCount = state
    ? [
        desired.deployed !== state.deployment.exists,
        desired.replicas !== state.deployment.replicas,
        desired.version !== (state.config?.app_version ?? "unknown"),
        desired.readinessHealthy !== (state.config?.initial_readiness ?? false),
        state.deployment.ready_replicas !== expectedReadyPods
      ].filter(Boolean).length
    : 0;
  const clusterTone = !state
    ? "neutral"
    : connection !== "live"
    ? "warn"
    : failingPods > 0
    ? "warn"
    : state.deployment.exists
    ? "ok"
    : "neutral";
  const clusterLabel = !state
    ? "Awaiting cluster state"
    : !state.deployment.exists
    ? "Cluster empty"
    : failingPods > 0
    ? "Attention needed"
    : "Demo healthy";
  const versionLabel = state?.config?.app_version ?? desired.version;

  const runAction = async (
    actionLabel: string,
    request: () => Promise<ActionResponse>,
    desiredPatch?: Partial<DesiredState>
  ): Promise<void> => {
    const actionStartedAtMs = Date.now();
    setBusyAction(actionLabel);
    // Safety net: if the request hangs past 20s, unlock buttons automatically.
    const safetyTimeout = setTimeout(() => setBusyAction(null), 20000);
    try {
      const result = await request();
      setState(result.state);
      previousStateRef.current = result.state;
      if (desiredPatch) {
        setDesired((previous) => ({ ...previous, ...desiredPatch }));
      }
      setTimeline((existing) =>
        prependTimeline(existing, [newTimeline("success", actionLabel, result.message)])
      );
    } catch (error) {
      setTimeline((existing) => prependTimeline(existing, [newTimeline("error", `${actionLabel} failed`, String(error))]));
    } finally {
      clearTimeout(safetyTimeout);
      const minimumVisibleMs = 700;
      const elapsedMs = Date.now() - actionStartedAtMs;
      if (elapsedMs < minimumVisibleMs) {
        await delay(minimumVisibleMs - elapsedMs);
      }
      setBusyAction(null);
    }
  };

  const onGenerateTraffic = async () => {
    if (trafficRunning) {
      return;
    }
    setTrafficRunning(true);
    const additions: TrafficEvent[] = [];

    for (let index = 0; index < trafficCount; index += 1) {
      try {
        const body = (await getTrafficInfo()) as DemoTrafficResponse;
        additions.unshift({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          at: new Date().toISOString(),
          ok: true,
          response: body
        });
      } catch (error) {
        additions.unshift({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          at: new Date().toISOString(),
          ok: false,
          response: { error: String(error) }
        });
      }

      setTrafficEvents((existing) => [...additions.slice(0, 1), ...existing].slice(0, maxTrafficRows));

      if (index < trafficCount - 1) {
        await delay(150);
      }
    }

    const failed = additions.filter((entry) => !entry.ok).length;
    setTimeline((existing) =>
      prependTimeline(
        existing,
        [
          newTimeline(
            failed === 0 ? "success" : "warn",
            "Traffic generation complete",
            `${trafficCount - failed}/${trafficCount} successful responses`
          )
        ]
      )
    );
    setTrafficRunning(false);
  };

  return (
    <main className="page-shell">
      <PageHero
        eyebrow="Live Demo Dashboard"
        title="Inside the Kubernetes Cluster"
        description="Presenter-friendly live demo for scheduling, readiness, scaling, rollouts, and recovery inside Kubernetes."
      >
        <span className={`connection-pill connection-${connection}`}>Backend: {connection}</span>
        <span className={`connection-pill connection-cluster-${clusterTone}`}>Cluster: {clusterLabel}</span>
        <span className="connection-pill">Last update: {formatTimestamp(state?.updated_at)}</span>
        {busyAction ? (
          <span className="connection-pill connection-pill-busy" role="status" aria-live="polite">
            <span className="inline-spinner" aria-hidden="true" />
            <span>Reconciling: {busyAction}</span>
          </span>
        ) : null}
      </PageHero>
      <PageNav current="dashboard" />

      <section className="summary-strip reveal-2" aria-label="Live demo summary">
        <article className="summary-card">
          <span className="summary-label">Pods Ready</span>
          <strong>{state ? `${readyPods}/${state.pods.length}` : "--"}</strong>
          <p>{failingPods > 0 ? `${failingPods} attention signal${failingPods > 1 ? "s" : ""}` : "Service looks healthy"}</p>
        </article>
        <article className="summary-card">
          <span className="summary-label">Workers</span>
          <strong>{state ? workerCount : "--"}</strong>
          <p>{state ? `${state.namespace} namespace in focus` : "Waiting for cluster state"}</p>
        </article>
        <article className="summary-card">
          <span className="summary-label">Version</span>
          <strong>{versionLabel}</strong>
          <p>{desired.version === versionLabel ? "Desired and running version aligned" : "Rollout drift is visible"}</p>
        </article>
        <article className="summary-card">
          <span className="summary-label">Drift</span>
          <strong>{state ? driftCount : "--"}</strong>
          <p>{driftCount === 0 ? "Desired and actual state match" : "Useful for explaining reconciliation"}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="reveal-3">
          <ActionControls
            podOptions={podOptions}
            selectedPod={selectedPod}
            rolloutVersion={rolloutTag}
            busyAction={busyAction}
            onSelectPod={setSelectedPod}
            onRolloutVersion={setRolloutTag}
            onCancelAction={() => setBusyAction(null)}
            onDeploy={() => runAction("Deploy app", deployApp, { deployed: true })}
            onScale1={() => runAction("Scale to 1", () => scaleDeployment(1), { deployed: true, replicas: 1 })}
            onScale3={() => runAction("Scale to 3", () => scaleDeployment(3), { deployed: true, replicas: 3 })}
            onDeletePod={() => runAction("Delete pod", () => deletePod(selectedPod || undefined))}
            onBreakReadiness={() => runAction("Break readiness", () => toggleReadiness(true))}
            onRestoreReadiness={() => runAction("Restore readiness", () => toggleReadiness(false))}
            onRollout={() => {
              const tag = rolloutTag.trim();
              if (!tag) {
                setTimeline((existing) => prependTimeline(existing, [newTimeline("warn", "Rollout tag is required")]));
                return;
              }
              runAction(`Rollout ${tag}`, () => rolloutVersion(tag), { deployed: true, version: tag });
            }}
            onGenerateTraffic={onGenerateTraffic}
            onReset={() => runAction("Reset demo", resetDemo, resetDesired)}
          />
        </div>

        <div className="reveal-4">
          <DesiredActualPanel desired={desired} actual={state} />
        </div>

        <div className="layout-span-2 reveal-5">
          <TopologyView state={state} />
        </div>

        <div className="layout-span-2">
          <WorkloadResourcesPanel state={state} />
        </div>

        <div className="layout-span-2 reveal-6">
          <TrafficPanel
            requestCount={trafficCount}
            running={trafficRunning}
            events={trafficEvents}
            onCountChange={(value) => setTrafficCount(Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : 12)}
            onGenerate={onGenerateTraffic}
            onClear={() => setTrafficEvents([])}
          />
        </div>

        <div className="layout-span-2 reveal-6">
          <EventTimeline events={timeline} />
        </div>
      </section>
    </main>
  );
}
