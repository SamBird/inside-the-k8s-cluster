import { ClusterState } from "../lib/types";
import {
  ExplainedFlowRun,
  ExplainedFlowScenario,
  explainedFlowScenarios,
  findExplainedFlowScenario
} from "../lib/explainedFlow";
import { StatusBadge } from "./StatusBadge";

interface ExplainedFlowPanelProps {
  scenario: ExplainedFlowScenario;
  run: ExplainedFlowRun | null;
  state: ClusterState | null;
  onScenarioChange: (scenario: ExplainedFlowScenario) => void;
}

type StepState = "pending" | "active" | "done" | "error";

function stepStateForIndex(run: ExplainedFlowRun | null, index: number, totalSteps: number): StepState {
  if (!run) {
    return "pending";
  }
  if (run.status === "selected") {
    // Teaching mode: all steps shown as conceptual walkthrough.
    return "done";
  }
  if (run.status === "success") {
    return "done";
  }
  if (run.status === "running") {
    // Show roughly the first half as done, the next one as active, rest pending.
    const activeIndex = Math.floor(totalSteps / 2);
    if (index < activeIndex) {
      return "done";
    }
    if (index === activeIndex) {
      return "active";
    }
    return "pending";
  }
  // error: show all before last as done, last attempted as error.
  const errorIndex = Math.floor(totalSteps / 2);
  if (index < errorIndex) {
    return "done";
  }
  if (index === errorIndex) {
    return "error";
  }
  return "pending";
}

function runStatusLabel(run: ExplainedFlowRun | null): { tone: "neutral" | "ok" | "warn" | "bad"; label: string } {
  if (!run) {
    return { tone: "neutral", label: "No recent action" };
  }
  if (run.status === "selected") {
    return { tone: "neutral", label: "Scenario selected" };
  }
  if (run.status === "running") {
    return { tone: "warn", label: "Action in progress" };
  }
  if (run.status === "success") {
    return { tone: "ok", label: "Action completed" };
  }
  return { tone: "bad", label: "Action failed" };
}

export function ExplainedFlowPanel({
  scenario,
  run,
  state,
  onScenarioChange
}: ExplainedFlowPanelProps) {
  const selected = findExplainedFlowScenario(scenario);
  const runForSelection = run?.scenario === scenario ? run : null;
  const status = runStatusLabel(runForSelection);
  const desiredReplicas = state?.deployment.replicas ?? 0;
  const runningPods = state?.pods.filter((pod) => pod.phase === "Running").length ?? 0;
  const readyPods = state?.pods.filter((pod) => pod.ready).length ?? 0;
  const totalPods = state?.pods.length ?? 0;

  return (
    <section className="panel explained-flow-panel layout-span-2 reveal-3">
      <div className="panel-header-row">
        <h2>Explained Control-Plane Flow</h2>
        <StatusBadge tone={status.tone} label={status.label} />
      </div>
      <p className="panel-subtitle">
        Educational explanation layer. Sequence is inferred from Kubernetes control-loop behavior and current action
        context, not raw component telemetry.
      </p>

      <div className="explained-flow-controls">
        <label htmlFor="explained-scenario">Scenario</label>
        <select
          id="explained-scenario"
          value={scenario}
          onChange={(event) => onScenarioChange(event.target.value as ExplainedFlowScenario)}
        >
          {explainedFlowScenarios.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <p className="explained-flow-summary">{selected.summary}</p>

      <div className="explained-teaching-copy">
        <p>
          <strong>Desired state:</strong> what is declared in Kubernetes objects (for example Deployment replicas and pod template).
        </p>
        <p>
          <strong>Actual state:</strong> what is currently running in the cluster (actual pods, readiness, and service endpoints).
        </p>
        <p>
          <strong>Reconciliation:</strong> control loops continuously compare desired vs actual and apply changes until they match.
        </p>
      </div>

      {scenario === "controller-reconciliation" ? (
        <div className="controller-explainer">
          <h3>Controller Reconciliation Explained</h3>
          <p>
            <strong>What a controller does:</strong> watches resources and compares desired state with actual state.
          </p>
          <p>
            <strong>What reconciliation means:</strong> if actual state drifts (for example a pod is deleted), the
            controller issues changes to close the gap.
          </p>
          <p>
            <strong>Why Kubernetes is self-healing:</strong> desired replicas remain declared, so the system recreates
            missing pods automatically.
          </p>
        </div>
      ) : null}

      <ol className="explained-flow-steps">
        {selected.steps.map((step, index) => {
          const stateClass = stepStateForIndex(runForSelection, index, selected.steps.length);
          return (
            <li key={step.id} className={`explained-step explained-step-${stateClass}`}>
              <div className="explained-step-index">{index + 1}</div>
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="explained-live-state">
        <h3>Live State Signals (Observed)</h3>
        <div className="explained-metrics-grid">
          <article className="explained-metric-card">
            <h4>Desired Replicas</h4>
            <strong>{desiredReplicas}</strong>
          </article>
          <article className="explained-metric-card">
            <h4>Actual Running</h4>
            <strong>{runningPods}</strong>
          </article>
          <article className="explained-metric-card">
            <h4>Ready Pods</h4>
            <strong>{readyPods}</strong>
          </article>
        </div>
        <p>Pod objects observed: {totalPods}</p>
        <p>Service present: {state?.service.exists ? "yes" : "no"}</p>
        <p>Current version hint: {state?.config?.app_version ?? "unknown"}</p>
      </div>
    </section>
  );
}
