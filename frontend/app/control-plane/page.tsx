"use client";

import { useEffect, useState } from "react";

import { ControlPlaneInspector } from "../../components/ControlPlaneInspector";
import { PageNav } from "../../components/PageNav";
import { PageHero } from "../../components/PageHero";
import { getControlPlaneState } from "../../lib/api";
import { ConnectionState, ControlPlaneState } from "../../lib/types";

const refreshIntervalMs = 5000;

export default function ControlPlanePage() {
  const [controlPlane, setControlPlane] = useState<ControlPlaneState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getControlPlaneState();
        if (cancelled) {
          return;
        }
        setControlPlane(next);
        setConnection("live");
      } catch {
        if (cancelled) {
          return;
        }
        setConnection("degraded");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    const timer = setInterval(load, refreshIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="page-shell">
      <PageHero
        eyebrow="Control Plane Inspector"
        title="Inside the Kubernetes Cluster"
        description="Teach how the API server, etcd, scheduler, and controller-manager translate desired state into running workloads."
      >
        <span className={`connection-pill connection-${connection}`}>Backend: {connection}</span>
        <span className="connection-pill">
          Last update: {controlPlane ? new Date(controlPlane.discovered_at).toLocaleTimeString() : "n/a"}
        </span>
      </PageHero>
      <PageNav current="control-plane" />

      <ControlPlaneInspector controlPlane={controlPlane} connection={connection} loading={loading} />
    </main>
  );
}
