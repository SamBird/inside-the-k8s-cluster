interface ActionControlsProps {
  podOptions: string[];
  selectedPod: string;
  rolloutVersion: string;
  busyAction: string | null;
  onSelectPod: (pod: string) => void;
  onRolloutVersion: (version: string) => void;
  onDeploy: () => void;
  onScale1: () => void;
  onScale3: () => void;
  onDeletePod: () => void;
  onBreakReadiness: () => void;
  onRestoreReadiness: () => void;
  onRollout: () => void;
  onGenerateTraffic: () => void;
  onReset: () => void;
}

function disabledIfBusy(busyAction: string | null): boolean {
  return busyAction !== null;
}

export function ActionControls({
  podOptions,
  selectedPod,
  rolloutVersion,
  busyAction,
  onSelectPod,
  onRolloutVersion,
  onDeploy,
  onScale1,
  onScale3,
  onDeletePod,
  onBreakReadiness,
  onRestoreReadiness,
  onRollout,
  onGenerateTraffic,
  onReset
}: ActionControlsProps) {
  return (
    <section className="panel action-panel">
      <div className="panel-header-row">
        <h2>Presenter Controls</h2>
        <span className="muted">Safe, predictable operations against the demo namespace</span>
      </div>
      <p className="presenter-guidance">
        Suggested live flow: deploy, create drift, show recovery, then prove service behavior under traffic.
      </p>

      <div className="action-stage-grid">
        <section className="action-stage">
          <div className="action-stage-header">
            <span className="action-stage-step">01</span>
            <div>
              <h3>Set up</h3>
              <p>Start the demo workload and control the replica count.</p>
            </div>
          </div>
          <div className="action-grid">
            <button className="action-button" onClick={onDeploy} disabled={disabledIfBusy(busyAction)}>
              Deploy app
            </button>
            <button className="action-button" onClick={onScale1} disabled={disabledIfBusy(busyAction)}>
              Scale to 1
            </button>
            <button className="action-button" onClick={onScale3} disabled={disabledIfBusy(busyAction)}>
              Scale to 3
            </button>
          </div>
        </section>

        <section className="action-stage">
          <div className="action-stage-header">
            <span className="action-stage-step">02</span>
            <div>
              <h3>Create drift</h3>
              <p>Trigger pod churn and single-pod readiness failures to expose reconciliation and routing.</p>
            </div>
          </div>
          <div className="action-grid">
            <div className="inline-controls inline-controls-wide">
              <select value={selectedPod} onChange={(event) => onSelectPod(event.target.value)}>
                <option value="">Delete oldest running pod</option>
                {podOptions.map((pod) => (
                  <option key={pod} value={pod}>
                    {pod}
                  </option>
                ))}
              </select>
              <button className="action-button" onClick={onDeletePod} disabled={disabledIfBusy(busyAction)}>
                Delete pod
              </button>
            </div>

            <button className="action-button action-warn" onClick={onBreakReadiness} disabled={disabledIfBusy(busyAction)}>
              Break readiness
            </button>
            <button className="action-button" onClick={onRestoreReadiness} disabled={disabledIfBusy(busyAction)}>
              Restore readiness
            </button>
          </div>
        </section>

        <section className="action-stage">
          <div className="action-stage-header">
            <span className="action-stage-step">03</span>
            <div>
              <h3>Prove behavior</h3>
              <p>Use rollout and traffic to show version changes and service routing.</p>
            </div>
          </div>
          <div className="action-grid">
            <div className="inline-controls inline-controls-wide">
              <input value={rolloutVersion} onChange={(event) => onRolloutVersion(event.target.value)} placeholder="v2" />
              <button className="action-button" onClick={onRollout} disabled={disabledIfBusy(busyAction)}>
                Rollout new version
              </button>
            </div>

            <button className="action-button" onClick={onGenerateTraffic} disabled={disabledIfBusy(busyAction)}>
              Generate traffic
            </button>

            <button className="action-button action-danger" onClick={onReset} disabled={disabledIfBusy(busyAction)}>
              Reset demo
            </button>
          </div>
        </section>
      </div>

      {busyAction ? (
        <p className="presenter-status" role="status" aria-live="polite">
          <span className="inline-spinner" aria-hidden="true" />
          <span>Running now: {busyAction}</span>
          <span className="presenter-status-note">
            Waiting for Kubernetes reconciliation. Pod and readiness changes can take a few seconds.
          </span>
        </p>
      ) : null}
    </section>
  );
}
