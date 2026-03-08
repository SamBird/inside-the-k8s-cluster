import { ClusterState } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

interface WorkloadResourcesPanelProps {
  state: ClusterState | null;
}

export function WorkloadResourcesPanel({ state }: WorkloadResourcesPanelProps) {
  if (!state) {
    return (
      <section className="panel loading-panel">
        <h2>Workload Resources</h2>
        <p>Waiting for backend state.</p>
      </section>
    );
  }

  const deploymentExists = state.deployment.exists;
  const replicaSetCount = deploymentExists ? 1 : 0;
  const readyPods = state.pods.filter((pod) => pod.ready).length;

  return (
    <section className="panel workload-panel reveal-4">
      <div className="panel-header-row">
        <h2>Workload Resources</h2>
        <p className="panel-subtitle">Deployment, ReplicaSet, Pods, and Service tracked separately from node topology.</p>
      </div>

      <div className="resource-grid">
        <article className="resource-card">
          <div className="resource-card-header">
            <h3>Deployment</h3>
            <StatusBadge tone={deploymentExists ? "ok" : "warn"} label={deploymentExists ? "Present" : "Missing"} />
          </div>
          <p>Name: {state.deployment.name}</p>
          <p>Desired replicas: {state.deployment.replicas}</p>
          <p>Ready replicas: {state.deployment.ready_replicas}</p>
        </article>

        <article className="resource-card">
          <div className="resource-card-header">
            <h3>ReplicaSet</h3>
            <StatusBadge tone="neutral" label={`${replicaSetCount} shown`} />
          </div>
          <p>Managed by Deployment: {state.deployment.name}</p>
          <p>Active ReplicaSets: {replicaSetCount}</p>
          <p className="muted">Count is inferred for teaching flow from deployment state.</p>
        </article>

        <article className="resource-card">
          <div className="resource-card-header">
            <h3>Pods</h3>
            <StatusBadge tone={readyPods === state.pods.length ? "ok" : "warn"} label={`${readyPods}/${state.pods.length} ready`} />
          </div>
          <p>Total demo pods: {state.pods.length}</p>
          <p>Running phase: {state.pods.filter((pod) => pod.phase === "Running").length}</p>
          <p>Not ready: {state.pods.filter((pod) => !pod.ready).length}</p>
        </article>

        <article className="resource-card">
          <div className="resource-card-header">
            <h3>Service</h3>
            <StatusBadge tone={state.service.exists ? "ok" : "warn"} label={state.service.exists ? "Present" : "Missing"} />
          </div>
          <p>Name: {state.service.name}</p>
          <p>Type: {state.service.type ?? "unknown"}</p>
          <p>ClusterIP: {state.service.cluster_ip ?? "n/a"}</p>
        </article>
      </div>
    </section>
  );
}
