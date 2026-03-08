"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ActionControls } from "../components/ActionControls";
import { ControlPlaneOverview } from "../components/ControlPlaneOverview";
import { DesiredActualPanel } from "../components/DesiredActualPanel";
import { ExplainedFlowPanel } from "../components/ExplainedFlowPanel";
import { EventTimeline } from "../components/EventTimeline";
import { TopologyView } from "../components/TopologyView";
import { TrafficPanel } from "../components/TrafficPanel";
import { WorkloadResourcesPanel } from "../components/WorkloadResourcesPanel";
import {
  ApiError,
  deletePod,
  deployApp,
  getTrafficInfo,
  getState,
  resetDemo,
  restartRollout,
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
import { ExplainedFlowRun, ExplainedFlowScenario } from "../lib/explainedFlow";

const trafficTargetLabel = "Backend proxy -> /api/traffic/info -> service/demo-app";

const defaultDesired: DesiredState = {
  deployed: false,
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

export default function DashboardPage() {
  const [state, setState] = useState<ClusterState | null>(null);
  const [desired, setDesired] = useState<DesiredState>(defaultDesired);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [explainedScenario, setExplainedScenario] = useState<ExplainedFlowScenario>("apply-yaml-journey");
  const [explainedRun, setExplainedRun] = useState<ExplainedFlowRun | null>(null);
  const [selectedPod, setSelectedPod] = useState<string>("");
  const [rolloutTag, setRolloutTag] = useState<string>("v2");
  const [trafficCount, setTrafficCount] = useState<number>(12);
  const [trafficDelayMs, setTrafficDelayMs] = useState<number>(120);
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

  const runAction = async (
    actionLabel: string,
    request: () => Promise<ActionResponse>,
    desiredPatch?: Partial<DesiredState>,
    explainedFlowScenario?: ExplainedFlowScenario
  ): Promise<void> => {
    setBusyAction(actionLabel);
    if (explainedFlowScenario) {
      setExplainedScenario(explainedFlowScenario);
      setExplainedRun({
        scenario: explainedFlowScenario,
        status: "running",
        actionLabel,
        startedAt: new Date().toISOString()
      });
    }
    try {
      const result = await request();
      setState(result.state);
      previousStateRef.current = result.state;
      if (desiredPatch) {
        setDesired((previous) => ({ ...previous, ...desiredPatch }));
      }
      if (explainedFlowScenario) {
        setExplainedRun({
          scenario: explainedFlowScenario,
          status: "success",
          actionLabel,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          message: result.message
        });
      }
      setTimeline((existing) =>
        prependTimeline(existing, [newTimeline("success", actionLabel, result.message)])
      );
    } catch (error) {
      if (explainedFlowScenario) {
        setExplainedRun({
          scenario: explainedFlowScenario,
          status: "error",
          actionLabel,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          message: String(error)
        });
      }
      setTimeline((existing) => prependTimeline(existing, [newTimeline("error", `${actionLabel} failed`, String(error))]));
    } finally {
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

      setTrafficEvents((existing) => [...additions.slice(0, 1), ...existing].slice(0, 80));

      if (index < trafficCount - 1) {
        await delay(Math.max(0, trafficDelayMs));
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
      <header className="hero-header reveal-1">
        <div>
          <h1>Inside the Kubernetes Cluster</h1>
          <p>Live demo control room for explaining scheduling, readiness, scaling, and rollouts.</p>
        </div>
        <div className="hero-status">
          <span className={`connection-pill connection-${connection}`}>Backend: {connection}</span>
          <span className="connection-pill">Last update: {state ? new Date(state.updated_at).toLocaleTimeString() : "n/a"}</span>
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="reveal-2">
          <ActionControls
            podOptions={podOptions}
            selectedPod={selectedPod}
            rolloutVersion={rolloutTag}
            busyAction={busyAction}
            onSelectPod={setSelectedPod}
            onRolloutVersion={setRolloutTag}
            onDeploy={() => runAction("Deploy app", deployApp, { deployed: true }, "apply-yaml-journey")}
            onScale1={() => runAction("Scale to 1", () => scaleDeployment(1), { deployed: true, replicas: 1 }, "scale-deployment")}
            onScale3={() => runAction("Scale to 3", () => scaleDeployment(3), { deployed: true, replicas: 3 }, "scale-deployment")}
            onDeletePod={() =>
              runAction("Delete pod", () => deletePod(selectedPod || undefined), undefined, "controller-reconciliation")
            }
            onBreakReadiness={() =>
              runAction("Break readiness", () => toggleReadiness(true), { deployed: true, readinessHealthy: false }, "break-readiness")
            }
            onRestoreReadiness={() =>
              runAction("Restore readiness", () => toggleReadiness(false), { deployed: true, readinessHealthy: true }, "break-readiness")
            }
            onRollout={() => {
              const tag = rolloutTag.trim();
              if (!tag) {
                setTimeline((existing) => prependTimeline(existing, [newTimeline("warn", "Rollout tag is required")]));
                return;
              }
              runAction(
                `Rollout ${tag}`,
                async () => {
                  try {
                    return await rolloutVersion(tag);
                  } catch (error) {
                    if (error instanceof ApiError && error.status === 404) {
                      setTimeline((existing) =>
                        prependTimeline(existing, [
                          newTimeline("warn", "Backend rollout endpoint missing", "Falling back to restart-rollout action")
                        ])
                      );
                      return await restartRollout();
                    }
                    if (error instanceof ApiError) {
                      throw error;
                    }
                    throw error;
                  }
                },
                { deployed: true, version: tag },
                "rollout-new-version"
              );
            }}
            onGenerateTraffic={onGenerateTraffic}
            onReset={() => {
              setExplainedRun(null);
              runAction("Reset demo", resetDemo, defaultDesired);
            }}
          />
        </div>

        <div className="reveal-4">
          <DesiredActualPanel desired={desired} actual={state} />
        </div>

        <ControlPlaneOverview state={state} />

        <ExplainedFlowPanel
          scenario={explainedScenario}
          run={explainedRun}
          state={state}
          onScenarioChange={setExplainedScenario}
        />

        <div className="reveal-5">
          <TopologyView state={state} />
        </div>

        <WorkloadResourcesPanel state={state} />

        <div className="reveal-6">
          <TrafficPanel
            trafficTarget={trafficTargetLabel}
            requestCount={trafficCount}
            delayMs={trafficDelayMs}
            running={trafficRunning}
            events={trafficEvents}
            onCountChange={(value) => setTrafficCount(Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : 12)}
            onDelayChange={(value) => setTrafficDelayMs(Number.isFinite(value) ? Math.min(3000, Math.max(0, value)) : 120)}
            onGenerate={onGenerateTraffic}
          />
        </div>

        <div className="reveal-6">
          <EventTimeline events={timeline} />
        </div>
      </section>
    </main>
  );
}
