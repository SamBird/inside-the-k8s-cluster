import { ClusterState, NodeState } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

interface ControlPlaneCard {
  name: string;
  does: string;
  when: string;
  reconcile: string;
}

const controlPlaneCards: ControlPlaneCard[] = [
  {
    name: "kube-apiserver",
    does: "Front door for Kubernetes API requests. Validates and persists requested state changes.",
    when: "Every kubectl apply, scale, patch, and controller update.",
    reconcile: "Stores desired state updates so controllers can observe and act."
  },
  {
    name: "etcd",
    does: "Cluster key-value store for desired and current object state.",
    when: "Any API write or read of Kubernetes objects.",
    reconcile: "Acts as source of truth that reconciliation loops continuously compare against."
  },
  {
    name: "kube-scheduler",
    does: "Assigns unscheduled Pods to worker nodes.",
    when: "After a Deployment/ReplicaSet creates Pods without node assignment.",
    reconcile: "Moves pending Pods toward desired running replicas by choosing placement."
  },
  {
    name: "kube-controller-manager",
    does: "Runs controllers that drive actual state toward desired state.",
    when: "Continuously, especially after deploy, scale, delete, or rollout changes.",
    reconcile: "Creates/deletes/updates resources until observed state matches desired state."
  }
];

interface ControlPlaneOverviewProps {
  state: ClusterState | null;
}

function isControlPlaneNode(node: NodeState): boolean {
  if (node.role === "control-plane") {
    return true;
  }
  const roles = node.roles ?? [];
  return roles.includes("control-plane") || roles.includes("master");
}

export function ControlPlaneOverview({ state }: ControlPlaneOverviewProps) {
  const nodes = state?.nodes ?? [];
  const controlPlaneNodes = nodes.filter(isControlPlaneNode);
  const workerNodes = nodes.filter((node) => !isControlPlaneNode(node));
  const deploymentDesired = state?.deployment.replicas ?? 0;
  const deploymentReady = state?.deployment.ready_replicas ?? 0;
  const podCount = state?.pods.length ?? 0;

  return (
    <section className="panel control-plane-panel layout-span-2 reveal-2">
      <div className="panel-header-row">
        <h2>Control Plane Overview</h2>
        <div className="control-plane-badges">
          <StatusBadge tone="neutral" label="Conceptual Teaching View" />
          <StatusBadge tone="ok" label="Discovered Cluster Context" />
        </div>
      </div>

      <div className="control-plane-section">
        <h3>Conceptual Components (Educational)</h3>
        <p className="panel-subtitle">
          Conceptual summary of control-plane components for teaching reconciliation. This is not process-level telemetry.
        </p>
      </div>
      <div className="control-plane-grid">
        {controlPlaneCards.map((item) => (
          <article key={item.name} className="control-plane-card">
            <h3>{item.name}</h3>
            <p>
              <strong>What it does:</strong> {item.does}
            </p>
            <p>
              <strong>When involved:</strong> {item.when}
            </p>
            <p>
              <strong>Desired vs actual:</strong> {item.reconcile}
            </p>
          </article>
        ))}
      </div>

      <div className="control-plane-section control-plane-live">
        <h3>Live Cluster Context (Discovered)</h3>
        <p className="panel-subtitle">
          Real metadata from Kubernetes API: control-plane node discovery, node roles/labels, and basic workload context.
        </p>

        {!state ? (
          <p className="muted">Waiting for backend state.</p>
        ) : (
          <>
            <div className="cluster-context-grid">
              <article className="cluster-context-card">
                <h4>Namespace</h4>
                <strong>{state.namespace}</strong>
              </article>
              <article className="cluster-context-card">
                <h4>Nodes</h4>
                <strong>
                  {nodes.length} total ({controlPlaneNodes.length} control-plane, {workerNodes.length} worker)
                </strong>
              </article>
              <article className="cluster-context-card">
                <h4>Deployment</h4>
                <strong>
                  {deploymentReady}/{deploymentDesired} ready
                </strong>
              </article>
              <article className="cluster-context-card">
                <h4>Service + Pods</h4>
                <strong>
                  {state.service.exists ? "service present" : "service missing"}, {podCount} pods
                </strong>
              </article>
            </div>

            {controlPlaneNodes.length === 0 ? (
              <div className="control-plane-note">
                <p>
                  No control-plane node discovered from role labels. Some local setups can hide or rename control-plane
                  role labels.
                </p>
              </div>
            ) : (
              <div className="control-plane-node-grid">
                {controlPlaneNodes.map((node) => (
                  <article key={node.name} className="control-plane-node-card">
                    <div className="control-plane-node-head">
                      <strong>{node.name}</strong>
                      <StatusBadge tone={node.ready ? "ok" : "bad"} label={node.ready ? "Node Ready" : "Node NotReady"} />
                    </div>
                    <p>Roles: {(node.roles ?? [node.role]).join(", ")}</p>
                    <p>Kubelet: {node.kubelet_version ?? "unknown"}</p>
                    <div className="control-plane-labels">
                      {Object.entries(node.labels ?? {}).length === 0 ? (
                        <span className="muted">No selected labels exposed</span>
                      ) : (
                        Object.entries(node.labels ?? {}).map(([key, value]) => (
                          <span key={key} className="label-chip">
                            {key}={value}
                          </span>
                        ))
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
