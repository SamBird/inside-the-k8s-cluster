import { TimelineEvent } from "../lib/types";

interface EventTimelineProps {
  events: TimelineEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
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
    </section>
  );
}
