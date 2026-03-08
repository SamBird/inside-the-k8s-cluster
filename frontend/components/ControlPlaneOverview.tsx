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

export function ControlPlaneOverview() {
  return (
    <section className="panel control-plane-panel layout-span-2 reveal-2">
      <div className="panel-header-row">
        <h2>Control Plane Overview</h2>
        <StatusBadge tone="neutral" label="Teaching View" />
      </div>
      <p className="panel-subtitle">
        Conceptual summary of core control-plane components used to explain reconciliation. This section is explanatory,
        not direct per-process monitoring.
      </p>

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
    </section>
  );
}
