import { KubernetesEvent, TimelineEvent } from "../lib/types";

interface EventTimelineProps {
  events: TimelineEvent[];
  k8sEvents?: KubernetesEvent[];
}

function componentTag(sourceComponent?: string | null): string | null {
  if (!sourceComponent) return null;
  if (sourceComponent === "default-scheduler") return "scheduler";
  if (sourceComponent === "kubelet") return "kubelet";
  if (
    sourceComponent.endsWith("-controller") ||
    sourceComponent === "deployment-controller" ||
    sourceComponent === "replicaset-controller"
  )
    return "controller-manager";
  return sourceComponent;
}

function componentLabel(tag: string): string {
  if (tag === "scheduler") return "kube-scheduler";
  if (tag === "kubelet") return "kubelet";
  if (tag === "controller-manager") return "controller-manager";
  return tag;
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "Scheduled":
      return "Pod assigned to a node by the scheduler";
    case "Pulling":
      return "Container image being pulled";
    case "Pulled":
      return "Container image pull complete";
    case "Created":
      return "Container created inside the pod";
    case "Started":
      return "Container process started";
    case "Killing":
      return "Container being stopped";
    case "SuccessfulCreate":
      return "Controller created a new pod";
    case "SuccessfulDelete":
      return "Controller deleted a pod";
    case "ScalingReplicaSet":
      return "Deployment scaling a ReplicaSet up or down";
    case "Unhealthy":
      return "Health check (liveness or readiness) failed";
    case "BackOff":
      return "Container restarting after a crash";
    case "FailedScheduling":
      return "Scheduler could not place the pod on a node";
    default:
      return "";
  }
}

function demoLevelTone(level: TimelineEvent["level"]): string {
  switch (level) {
    case "success":
      return "ok";
    case "warn":
      return "warn";
    case "error":
      return "error";
    default:
      return "neutral";
  }
}

export function EventTimeline({ events, k8sEvents }: EventTimelineProps) {
  return (
    <div className="events-split">
      <section className="panel events-split-col">
        <div className="panel-header-row">
          <h2>Demo Timeline</h2>
          <span className="muted">{events.length} events</span>
        </div>

        {events.length === 0 ? (
          <p className="muted">No events yet.</p>
        ) : (
          <ul className="timeline-list">
            {events.map((entry) => {
              const tone = demoLevelTone(entry.level);
              return (
                <li key={entry.id} className={`timeline-item event-card event-tone-${tone}`}>
                  <div className="timeline-row">
                    <span className="timeline-time">{new Date(entry.at).toLocaleTimeString()}</span>
                    <span className={`event-type-badge event-badge-${tone}`}>{entry.level}</span>
                    <strong>{entry.title}</strong>
                  </div>
                  <p className="event-detail">{entry.detail || "\u00A0"}</p>
                  <div className="event-meta">
                    <span className="event-object">source: dashboard</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel events-split-col">
        <div className="panel-header-row">
          <h2>Kubernetes Events</h2>
          <span className="muted">{k8sEvents?.length ?? 0} events</span>
        </div>

        {!k8sEvents || k8sEvents.length === 0 ? (
          <p className="muted">No Kubernetes events yet.</p>
        ) : (
          <ul className="timeline-list">
            {k8sEvents.map((ev, idx) => {
              const tag = componentTag(ev.source_component);
              const isWarning = ev.event_type === "Warning";
              const tone = isWarning ? "warn" : "ok";
              const hint = reasonLabel(ev.reason);
              return (
                <li
                  key={`k8s-${idx}-${ev.object_name}-${ev.reason}`}
                  className={`timeline-item event-card event-tone-${tone}`}
                >
                  <div className="timeline-row">
                    <span className="timeline-time">
                      {ev.last_seen ? new Date(ev.last_seen).toLocaleTimeString() : "--"}
                    </span>
                    <span className={`event-type-badge event-badge-${tone}`}>
                      {ev.event_type}
                    </span>
                    <strong>{ev.reason}</strong>
                    {ev.count > 1 ? <span className="k8s-event-count">x{ev.count}</span> : null}
                  </div>

                  {hint ? <p className="event-hint">{hint}</p> : null}

                  <p className="event-detail">{ev.message}</p>

                  <div className="event-meta">
                    <span className="event-object">
                      {ev.object_kind}/{ev.object_name}
                    </span>
                    {tag ? (
                      <span className={`k8s-component-tag k8s-tag-${tag}`}>{componentLabel(tag)}</span>
                    ) : null}
                    {ev.source_host ? (
                      <span className="event-host">{ev.source_host}</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
