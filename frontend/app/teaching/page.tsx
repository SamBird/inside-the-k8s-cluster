"use client";

import { useEffect, useState } from "react";

import { ControlPlaneOverview } from "../../components/ControlPlaneOverview";
import { ExplainedFlowPanel } from "../../components/ExplainedFlowPanel";
import { PageNav } from "../../components/PageNav";
import { PageHero } from "../../components/PageHero";
import { getState, subscribeToState } from "../../lib/api";
import { ExplainedFlowRun, ExplainedFlowScenario, findExplainedFlowScenario } from "../../lib/explainedFlow";
import { ClusterState, ConnectionState } from "../../lib/types";

export default function TeachingPage() {
  const [state, setState] = useState<ClusterState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [explainedScenario, setExplainedScenario] = useState<ExplainedFlowScenario>("apply-yaml-journey");
  const [explainedRun, setExplainedRun] = useState<ExplainedFlowRun | null>(null);

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

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const onExplainedScenarioChange = (nextScenario: ExplainedFlowScenario) => {
    setExplainedScenario(nextScenario);
    const next = findExplainedFlowScenario(nextScenario);
    setExplainedRun({
      scenario: nextScenario,
      status: "selected",
      actionLabel: next.label,
      startedAt: new Date().toISOString(),
      message: "Scenario selected. Steps below describe the conceptual control-plane sequence."
    });
  };

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
        <ControlPlaneOverview state={state} />
        <ExplainedFlowPanel
          scenario={explainedScenario}
          run={explainedRun}
          state={state}
          onScenarioChange={onExplainedScenarioChange}
        />
      </section>
    </main>
  );
}
