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

export function EventTimeline({ events, k8sEvents }: EventTimelineProps) {
  return (
    <section className="panel timeline-panel">
      <div className="panel-header-row">
        <h2>Live Event Timeline</h2>
        <span className="muted">Newest first</span>
      </div>

      {events.length === 0 ? <p className="muted">No events yet.</p> : null}

      <ul className="timeline-list">
        {events.map((entry) => (
          <li key={entry.id} className={`timeline-item level-${entry.level}`}>
            <div className="timeline-row">
              <span className="timeline-time">{new Date(entry.at).toLocaleTimeString()}</span>
              <strong>{entry.title}</strong>
            </div>
            {entry.detail ? <p>{entry.detail}</p> : null}
          </li>
        ))}
      </ul>

      {k8sEvents && k8sEvents.length > 0 ? (
        <>
          <div className="panel-header-row k8s-events-header">
            <h3>Kubernetes Events</h3>
            <span className="muted">{k8sEvents.length} events</span>
          </div>
          <ul className="timeline-list k8s-events-list">
            {k8sEvents.map((ev, idx) => {
              const tag = componentTag(ev.source_component);
              const isWarning = ev.event_type === "Warning";
              return (
                <li
                  key={`k8s-${idx}-${ev.object_name}-${ev.reason}`}
                  className={`timeline-item k8s-event-item ${isWarning ? "k8s-event-warning" : "k8s-event-normal"}`}
                >
                  <div className="timeline-row">
                    <span className="timeline-time">
                      {ev.last_seen ? new Date(ev.last_seen).toLocaleTimeString() : "--"}
                    </span>
                    {tag ? <span className={`k8s-component-tag k8s-tag-${tag}`}>[{tag}]</span> : null}
                    <strong>{ev.reason}</strong>
                    {ev.count > 1 ? <span className="k8s-event-count">x{ev.count}</span> : null}
                  </div>
                  <p>
                    <span className="k8s-event-object">
                      {ev.object_kind}/{ev.object_name}
                    </span>{" "}
                    {ev.message}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
