import { TrafficEvent } from "../lib/types";

interface TrafficPanelProps {
  trafficTarget: string;
  requestCount: number;
  delayMs: number;
  events: TrafficEvent[];
  running: boolean;
  onCountChange: (value: number) => void;
  onDelayChange: (value: number) => void;
  onGenerate: () => void;
}

export function TrafficPanel({
  trafficTarget,
  requestCount,
  delayMs,
  events,
  running,
  onCountChange,
  onDelayChange,
  onGenerate
}: TrafficPanelProps) {
  const successful = events.filter((e) => e.ok).length;
  const failed = events.length - successful;

  return (
    <section className="panel traffic-panel">
      <div className="panel-header-row">
        <h2>Traffic / Responses</h2>
        <span className="muted">Target: {trafficTarget}</span>
      </div>

      <p className="panel-subtitle">
        Use this panel to demonstrate Service load balancing by observing changing pod names in responses.
      </p>

      <div className="traffic-controls">
        <label>
          Requests
          <input
            type="number"
            min={1}
            max={100}
            value={requestCount}
            onChange={(event) => onCountChange(Number(event.target.value))}
          />
        </label>
        <label>
          Delay (ms)
          <input type="number" min={0} max={3000} value={delayMs} onChange={(event) => onDelayChange(Number(event.target.value))} />
        </label>
        <button className="action-button" onClick={onGenerate} disabled={running}>
          {running ? (
            <span className="button-with-spinner">
              <span className="inline-spinner" aria-hidden="true" />
              <span>Generating...</span>
            </span>
          ) : (
            "Generate Traffic"
          )}
        </button>
      </div>

      <div className="traffic-summary">
        <span>Responses: {events.length}</span>
        <span>Success: {successful}</span>
        <span>Failed: {failed}</span>
      </div>

      <div className="traffic-table-wrap">
        <table className="traffic-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Pod</th>
              <th>Node</th>
              <th>Version</th>
              <th>Request #</th>
              <th>Ready</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {events.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.at).toLocaleTimeString()}</td>
                <td>{entry.response.podName ?? "-"}</td>
                <td>{entry.response.nodeName ?? "-"}</td>
                <td>{entry.response.imageVersion ?? "-"}</td>
                <td>{entry.response.requestCount ?? "-"}</td>
                <td>{typeof entry.response.readiness === "boolean" ? String(entry.response.readiness) : "-"}</td>
                <td>{entry.ok ? "ok" : entry.response.error ?? "failed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
