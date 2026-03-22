"use client";

import { useEffect, useRef } from "react";

import { ClusterState, DesiredState } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

interface DesiredActualPanelProps {
  desired: DesiredState;
  actual: ClusterState | null;
}

interface CompareRow {
  label: string;
  desired: string;
  actual: string;
  match: boolean;
}

export function DesiredActualPanel({ desired, actual }: DesiredActualPanelProps) {
  const prevActualsRef = useRef<Record<string, string>>({});
  const changedKeysRef = useRef<Set<string>>(new Set());
  const flashGenRef = useRef(0);

  const expectedReadyPods = desired.deployed ? desired.replicas : 0;
  const actualValues = {
    deployed: actual?.deployment.exists ?? false,
    replicas: actual?.deployment.replicas ?? 0,
    version: actual?.config?.app_version ?? "unknown",
    readinessHealthy: actual?.config?.initial_readiness ?? false,
    readyPods: actual?.deployment.ready_replicas ?? 0
  };

  const rows: CompareRow[] = [
    {
      label: "Deployment exists",
      desired: desired.deployed ? "Yes" : "No",
      actual: actualValues.deployed ? "Yes" : "No",
      match: desired.deployed === actualValues.deployed
    },
    {
      label: "Replica target",
      desired: String(desired.replicas),
      actual: String(actualValues.replicas),
      match: desired.replicas === actualValues.replicas
    },
    {
      label: "App version",
      desired: desired.version,
      actual: actualValues.version,
      match: desired.version === actualValues.version
    },
    {
      label: "Ready pods",
      desired: String(expectedReadyPods),
      actual: String(actualValues.readyPods),
      match: expectedReadyPods === actualValues.readyPods
    },
    {
      label: "Readiness config",
      desired: desired.readinessHealthy ? "Healthy" : "Failing",
      actual: actualValues.readinessHealthy ? "Healthy" : "Failing",
      match: desired.readinessHealthy === actualValues.readinessHealthy
    }
  ];

  const driftCount = rows.filter((row) => !row.match).length;

  // Detect which rows changed since last render and trigger a flash.
  const currentActuals: Record<string, string> = {};
  for (const row of rows) {
    currentActuals[row.label] = row.actual;
  }

  const changed = new Set<string>();
  for (const row of rows) {
    const prev = prevActualsRef.current[row.label];
    if (prev !== undefined && prev !== row.actual) {
      changed.add(row.label);
    }
  }

  if (changed.size > 0) {
    changedKeysRef.current = changed;
    flashGenRef.current += 1;
  }
  prevActualsRef.current = currentActuals;

  // Force re-trigger animation by using a generation key.
  const flashGen = flashGenRef.current;

  // Clear changed keys after animation duration so flash doesn't persist across unrelated re-renders.
  useEffect(() => {
    if (changedKeysRef.current.size === 0) return;
    const timer = setTimeout(() => {
      changedKeysRef.current = new Set();
    }, 1600);
    return () => clearTimeout(timer);
  }, [flashGen]);

  return (
    <section className="panel desired-panel">
      <div className="panel-header-row">
        <h2>Desired vs Actual State</h2>
        <StatusBadge
          tone={driftCount === 0 ? "ok" : "warn"}
          label={driftCount === 0 ? "In Sync" : `${driftCount} Drift Item${driftCount > 1 ? "s" : ""}`}
        />
      </div>

      <p className="panel-subtitle">
        Desired state comes from operator actions. Actual state comes from Kubernetes.
      </p>

      <table className="state-table">
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Desired</th>
            <th>Actual</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const flashing = changedKeysRef.current.has(row.label);
            return (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.desired}</td>
                <td className={flashing ? "cell-changed" : undefined} key={flashing ? `${row.label}-${flashGen}` : row.label}>{row.actual}</td>
                <td>{row.match ? <StatusBadge tone="ok" label="Match" /> : <StatusBadge tone="warn" label="Drift" />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="readiness-note">
        <h3>Readiness semantics</h3>
        <p>
          A pod can be <strong>Running</strong> and still be <strong>Not Ready</strong>. Service load balancing should include only Ready
          pods, so one failing pod can drop out while traffic continues through healthy replicas.
        </p>
      </div>
    </section>
  );
}
