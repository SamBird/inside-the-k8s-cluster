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
  onTriggerApplyYamlJourney: () => void;
}

type StepState = "pending" | "active" | "done" | "error";

function stepStateForIndex(run: ExplainedFlowRun | null, index: number): StepState {
  if (!run) {
    return "pending";
  }
  if (run.status === "success") {
    return "done";
  }
  if (run.status === "running") {
    if (index <= 2) {
      return "done";
    }
    if (index === 3) {
      return "active";
    }
    return "pending";
  }
  if (index <= 2) {
    return "done";
  }
  if (index === 3) {
    return "error";
  }
  return "pending";
}

function runStatusLabel(run: ExplainedFlowRun | null): { tone: "neutral" | "ok" | "warn" | "bad"; label: string } {
  if (!run) {
    return { tone: "neutral", label: "No recent action" };
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
  onScenarioChange,
  onTriggerApplyYamlJourney
}: ExplainedFlowPanelProps) {
  const selected = findExplainedFlowScenario(scenario);
  const runForSelection = run?.scenario === scenario ? run : null;
  const status = runStatusLabel(runForSelection);
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
        <button type="button" className="action-button explained-flow-trigger" onClick={onTriggerApplyYamlJourney}>
          Apply YAML journey
        </button>
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

      <ol className="explained-flow-steps">
        {selected.steps.map((step, index) => {
          const stateClass = stepStateForIndex(runForSelection, index);
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
        <p>Deployment exists: {state?.deployment.exists ? "yes" : "no"}</p>
        <p>
          Replicas desired/ready: {state?.deployment.replicas ?? 0}/{state?.deployment.ready_replicas ?? 0}
        </p>
        <p>
          Pod readiness: {readyPods}/{totalPods}
        </p>
        <p>Service present: {state?.service.exists ? "yes" : "no"}</p>
        <p>Current version hint: {state?.config?.app_version ?? "unknown"}</p>
      </div>
    </section>
  );
}
