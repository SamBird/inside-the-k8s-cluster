import { TrafficEvent } from "../lib/types";

interface TrafficPanelProps {
  requestCount: number;
  events: TrafficEvent[];
  running: boolean;
  onCountChange: (value: number) => void;
  onGenerate: () => void;
  onStop: () => void;
  onClear: () => void;
}

interface PodSummary {
  podName: string;
  count: number;
  ready: boolean;
}

function buildPodSummary(events: TrafficEvent[]): PodSummary[] {
  const byPod = new Map<string, PodSummary>();
  for (const event of events) {
    if (!event.ok) continue;
    const name = event.response.podName ?? "unknown";
    const existing = byPod.get(name);
    if (existing) {
      existing.count += 1;
    } else {
      byPod.set(name, {
        podName: name,
        count: 1,
        ready: event.response.readiness !== false
      });
    }
  }
  return [...byPod.values()].sort((a, b) => b.count - a.count);
}

export function TrafficPanel({
  requestCount,
  events,
  running,
  onCountChange,
  onGenerate,
  onStop,
  onClear
}: TrafficPanelProps) {
  const successful = events.filter((e) => e.ok).length;
  const failed = events.length - successful;
  const podSummary = buildPodSummary(events);

  return (
    <section className="panel traffic-panel">
      <div className="panel-header-row">
        <h2>Traffic</h2>
        <span className="muted">Routes via service to ready pods</span>
      </div>

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
        {running ? (
          <button type="button" className="cancel-action-button" onClick={onStop}>
            Stop
          </button>
        ) : null}
        {events.length > 0 && !running ? (
          <button type="button" className="cancel-action-button" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      {events.length > 0 ? (
        <>
          <p className="traffic-result-summary">
            {failed === 0
              ? `${successful}/${events.length} successful`
              : `${successful}/${events.length} successful · ${failed} failed`}
          </p>

          <div className="traffic-rate-bar">
            <div className="traffic-rate-ok" style={{ width: `${(successful / Math.max(events.length, 1)) * 100}%` }} />
            <div className="traffic-rate-fail" style={{ width: `${(failed / Math.max(events.length, 1)) * 100}%` }} />
          </div>

          <div className="traffic-pod-pills">
            {podSummary.map((pod) => (
              <div
                key={pod.podName}
                className={`traffic-pod-pill ${pod.ready ? "pod-pill-ready" : "pod-pill-unready"}`}
              >
                <strong>{pod.podName}</strong>
                <span>{pod.count} {pod.count === 1 ? "req" : "reqs"}</span>
                <span>{pod.ready ? "Ready" : "Not Ready"}</span>
              </div>
            ))}
            {failed > 0 ? (
              <div className="traffic-pod-pill pod-pill-failed">
                <strong>{failed} failed</strong>
                <span>no pod reached</span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
