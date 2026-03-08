import { ConnectionState, ControlPlaneComponentState, ControlPlaneState } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

interface ControlPlaneInspectorProps {
  controlPlane: ControlPlaneState | null;
  connection: ConnectionState;
  loading: boolean;
}

function formatTime(value?: string | null): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function componentTone(component: ControlPlaneComponentState): "ok" | "warn" | "bad" | "neutral" {
  if (!component.observed) {
    return "neutral";
  }

  if (component.ready && component.phase === "Running") {
    return "ok";
  }

  if (component.phase === "Running") {
    return "warn";
  }

  return "bad";
}

function componentLabel(component: ControlPlaneComponentState): string {
  if (!component.observed) {
    return "Not discovered";
  }
  if (component.ready && component.phase === "Running") {
    return "Observed healthy";
  }
  if (component.phase === "Running") {
    return "Observed with warnings";
  }
  return `Observed ${component.phase ?? "unknown"}`;
}

function discoveryTone(connection: ConnectionState, warnings: string[]): "ok" | "warn" | "bad" | "neutral" {
  if (connection !== "live") {
    return "bad";
  }
  if (warnings.length > 0) {
    return "warn";
  }
  return "ok";
}

function discoveryLabel(controlPlane: ControlPlaneState | null): string {
  if (!controlPlane) {
    return "Waiting for live discovery";
  }
  if (controlPlane.discovery_warnings.length > 0) {
    return "Partial discovery";
  }
  return "Live discovery healthy";
}

export function ControlPlaneInspector({ controlPlane, connection, loading }: ControlPlaneInspectorProps) {
  const warnings = controlPlane?.discovery_warnings ?? [];

  return (
    <>
      <section className="panel control-plane-panel reveal-2">
        <div className="panel-header-row">
          <h2>Control-Plane Internals</h2>
          <div className="control-plane-badges">
            <StatusBadge tone="neutral" label="Teaching + Live Signals" />
            <StatusBadge
              tone={discoveryTone(connection, warnings)}
              label={loading ? "Loading" : discoveryLabel(controlPlane)}
            />
          </div>
        </div>
        <p className="panel-subtitle">
          This page combines educational explanations with live Kubernetes API signals from `kube-system` pods and
          leader leases. It does not expose deep process internals from inside binaries.
        </p>

        <div className="cluster-context-grid">
          <article className="cluster-context-card">
            <h4>Discovery Namespace</h4>
            <strong>{controlPlane?.namespace ?? "kube-system"}</strong>
          </article>
          <article className="cluster-context-card">
            <h4>Control-Plane Nodes</h4>
            <strong>{controlPlane?.control_plane_node_names.length ?? 0}</strong>
          </article>
          <article className="cluster-context-card">
            <h4>Components Tracked</h4>
            <strong>{controlPlane?.components.length ?? 4}</strong>
          </article>
          <article className="cluster-context-card">
            <h4>Last Discovery</h4>
            <strong>{formatTime(controlPlane?.discovered_at)}</strong>
          </article>
        </div>

        {warnings.length > 0 ? (
          <div className="control-plane-note">
            <p>
              <strong>Discovery warnings:</strong> {warnings.join(" | ")}
            </p>
          </div>
        ) : null}
      </section>

      <section className="control-plane-grid reveal-3">
        {(controlPlane?.components ?? []).map((component) => (
          <article key={component.key} className="control-plane-card">
            <div className="panel-header-row">
              <h3>{component.title}</h3>
              <StatusBadge tone={componentTone(component)} label={componentLabel(component)} />
            </div>
            <p>
              <strong>What it does:</strong> {component.what_it_does}
            </p>
            <p>
              <strong>When involved:</strong> {component.when_involved}
            </p>
            <p>
              <strong>Desired vs actual link:</strong> {component.reconciliation_link}
            </p>

            <div className="control-plane-live-signals">
              <h4>Live Signals (Observed)</h4>
              <p>
                <strong>Pod:</strong> {component.pod_name ?? "not discovered"}
              </p>
              <p>
                <strong>Phase/Ready:</strong> {component.phase ?? "n/a"} / {component.ready ? "yes" : "no"}
              </p>
              <p>
                <strong>Node:</strong> {component.node_name ?? "n/a"}
              </p>
              <p>
                <strong>Image:</strong> {component.image ?? "n/a"}
              </p>
              <p>
                <strong>Restarts:</strong> {component.restart_count}
              </p>
              <p>
                <strong>Pod IP:</strong> {component.pod_ip ?? "n/a"}
              </p>
              <p>
                <strong>Started:</strong> {formatTime(component.started_at)}
              </p>

              {component.lease ? (
                <div className="control-plane-lease-card">
                  <h4>Leader Lease (Observed)</h4>
                  <p>
                    <strong>Lease:</strong> {component.lease.name}
                  </p>
                  <p>
                    <strong>Holder:</strong> {component.lease.holder_identity ?? "n/a"}
                  </p>
                  <p>
                    <strong>Renew Time:</strong> {formatTime(component.lease.renew_time)}
                  </p>
                  <p>
                    <strong>Acquire Time:</strong> {formatTime(component.lease.acquire_time)}
                  </p>
                  <p>
                    <strong>Duration:</strong> {component.lease.lease_duration_seconds ?? "n/a"}s
                  </p>
                  <p>
                    <strong>Transitions:</strong> {component.lease.lease_transitions ?? "n/a"}
                  </p>
                </div>
              ) : null}

              {component.notes.length > 0 ? (
                <div className="control-plane-signal-notes">
                  <h4>Notes</h4>
                  <ul>
                    {component.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
