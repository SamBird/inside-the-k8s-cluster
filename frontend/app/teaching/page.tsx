"use client";

import { useEffect, useRef, useState } from "react";

import { ControlPlaneOverview } from "../../components/ControlPlaneOverview";
import { ExplainedFlowPanel } from "../../components/ExplainedFlowPanel";
import { PageNav } from "../../components/PageNav";
import { PageHero } from "../../components/PageHero";
import { getState, subscribeToK8sEvents, subscribeToState } from "../../lib/api";
import { ExplainedFlowRun, ExplainedFlowScenario, actionLabelToScenario, findExplainedFlowScenario } from "../../lib/explainedFlow";
import { ClusterState, ConnectionState, ControlPlaneComponent, KubernetesEvent } from "../../lib/types";

const ACTIVITY_WINDOW_MS = 5000;

function inferComponents(event: KubernetesEvent): ControlPlaneComponent[] {
  const components: ControlPlaneComponent[] = ["kube-apiserver", "etcd"];
  const src = event.source_component;
  if (src === "default-scheduler") {
    components.push("kube-scheduler");
  } else if (
    src === "deployment-controller" ||
    src === "replicaset-controller" ||
    (src && src.endsWith("-controller"))
  ) {
    components.push("kube-controller-manager");
  }
  return components;
}

export default function TeachingPage() {
  const [state, setState] = useState<ClusterState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [explainedScenario, setExplainedScenario] = useState<ExplainedFlowScenario>("apply-yaml-journey");
  const [explainedRun, setExplainedRun] = useState<ExplainedFlowRun>({
    scenario: "apply-yaml-journey",
    status: "selected",
    actionLabel: findExplainedFlowScenario("apply-yaml-journey").label,
    startedAt: new Date().toISOString(),
    message: "Scenario selected. Steps below describe the conceptual control-plane sequence."
  });
  const [activeComponents, setActiveComponents] = useState<Set<ControlPlaneComponent>>(new Set());
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [k8sEvents, setK8sEvents] = useState<KubernetesEvent[]>([]);

  const recentEventsRef = useRef<{ at: number; components: ControlPlaneComponent[] }[]>([]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const initial = await getState();
        if (cancelled) {
          return;
        }
        setState(initial);
        setConnection("live");
      } catch {
        if (cancelled) {
          return;
        }
        setConnection("degraded");
      }
    };

    bootstrap();

    const unsubscribe = subscribeToState({
      onState: (incoming) => {
        setConnection("live");
        setState(incoming);
      },
      onError: () => {
        setConnection("degraded");
      },
      onOpen: () => {
        setConnection("live");
      }
    });

    const unsubscribeK8s = subscribeToK8sEvents({
      onEvent: (event) => {
        const components = inferComponents(event);
        const now = Date.now();
        recentEventsRef.current.push({ at: now, components });

        // Prune old entries and derive active set.
        recentEventsRef.current = recentEventsRef.current.filter((e) => now - e.at < ACTIVITY_WINDOW_MS);
        const active = new Set<ControlPlaneComponent>();
        for (const entry of recentEventsRef.current) {
          for (const c of entry.components) {
            active.add(c);
          }
        }
        setActiveComponents(active);

        // Store recent K8s events for the compact feed.
        setK8sEvents((existing) => [event, ...existing].slice(0, 15));
      },
      onError: () => {},
      onOpen: () => {}
    });

    // Decay timer: clear active components when no events arrive.
    const decayTimer = setInterval(() => {
      const now = Date.now();
      recentEventsRef.current = recentEventsRef.current.filter((e) => now - e.at < ACTIVITY_WINDOW_MS);
      if (recentEventsRef.current.length === 0) {
        setActiveComponents(new Set());
      } else {
        const active = new Set<ControlPlaneComponent>();
        for (const entry of recentEventsRef.current) {
          for (const c of entry.components) {
            active.add(c);
          }
        }
        setActiveComponents(active);
      }
    }, 1000);

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeK8s();
      clearInterval(decayTimer);
    };
  }, []);

  const onExplainedScenarioChange = (nextScenario: ExplainedFlowScenario) => {
    setExplainedScenario(nextScenario);
    setCurrentStep(0);
    const next = findExplainedFlowScenario(nextScenario);
    setExplainedRun({
      scenario: nextScenario,
      status: "selected",
      actionLabel: next.label,
      startedAt: new Date().toISOString(),
      message: "Scenario selected. Steps below describe the conceptual control-plane sequence."
    });
  };

  // Auto-sync: when the presenter triggers an action on the dashboard (other tab),
  // automatically switch the explained-flow scenario to match.
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key !== "last-demo-action" || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as { action: string; at: number };
        const matched = actionLabelToScenario(payload.action);
        if (matched) {
          setExplainedScenario(matched);
          setCurrentStep(0);
          const next = findExplainedFlowScenario(matched);
          setExplainedRun({
            scenario: matched,
            status: "selected",
            actionLabel: next.label,
            startedAt: new Date().toISOString(),
            message: "Scenario selected. Steps below describe the conceptual control-plane sequence."
          });
        }
      } catch {
        // Malformed payload; ignore.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <main className="page-shell">
      <PageHero
        eyebrow="Teaching View"
        title="Inside the Kubernetes Cluster"
        description="Conceptual control-plane walkthroughs for desired state, reconciliation, readiness, and rollout storytelling."
      >
        <span className={`connection-pill connection-${connection}`}>Backend: {connection}</span>
        <span className="connection-pill">Last update: {state ? new Date(state.updated_at).toLocaleTimeString() : "n/a"}</span>
      </PageHero>
      <PageNav current="teaching" />

      <section className="dashboard-grid">
        <ControlPlaneOverview state={state} activeComponents={activeComponents} />
        <ExplainedFlowPanel
          scenario={explainedScenario}
          run={explainedRun}
          state={state}
          onScenarioChange={onExplainedScenarioChange}
          currentStep={currentStep}
          onStepAdvance={setCurrentStep}
        />

        <section className="panel layout-span-2 reveal-4">
          <div className="panel-header-row">
            <h2>Live Kubernetes Events</h2>
            <span className="muted">{k8sEvents.length} events</span>
          </div>
          {k8sEvents.length === 0 ? (
            <p className="muted">No Kubernetes events yet. Trigger an action on the dashboard to see events flow in.</p>
          ) : (
            <ul className="compact-k8s-feed">
              {k8sEvents.map((ev, idx) => {
                const isWarning = ev.event_type === "Warning";
                return (
                  <li key={`k8s-${idx}-${ev.object_name}-${ev.reason}`} className={`compact-k8s-item ${isWarning ? "compact-k8s-warn" : ""}`}>
                    <span className="compact-k8s-time">
                      {ev.last_seen ? new Date(ev.last_seen).toLocaleTimeString() : "--"}
                    </span>
                    <span className={`event-type-badge event-badge-${isWarning ? "warn" : "ok"}`}>
                      {ev.reason}
                    </span>
                    <span className="compact-k8s-msg">{ev.message}</span>
                    {ev.source_component ? (
                      <span className="compact-k8s-src">{ev.source_component}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
