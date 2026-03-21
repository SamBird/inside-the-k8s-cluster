import { ClusterState, TimelineEvent } from "./types";

function event(level: TimelineEvent["level"], title: string, detail?: string): TimelineEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    level,
    title,
    detail
  };
}

export function diffState(prev: ClusterState | null, next: ClusterState): TimelineEvent[] {
  if (!prev) {
    return [event("info", "Initial cluster snapshot received")];
  }

  const out: TimelineEvent[] = [];

  if (prev.deployment.exists !== next.deployment.exists) {
    out.push(
      event(
        next.deployment.exists ? "success" : "warn",
        next.deployment.exists ? "Deployment now exists" : "Deployment removed"
      )
    );
  }

  if (prev.deployment.replicas !== next.deployment.replicas) {
    out.push(
      event("info", "Replica target changed", `${prev.deployment.replicas} -> ${next.deployment.replicas}`)
    );
  }

  if (prev.deployment.ready_replicas !== next.deployment.ready_replicas) {
    out.push(
      event(
        "info",
        "Ready pod count changed",
        `${prev.deployment.ready_replicas} -> ${next.deployment.ready_replicas}`
      )
    );
  }

  const prevPods = new Set(prev.pods.map((pod) => pod.name));
  const nextPods = new Set(next.pods.map((pod) => pod.name));

  for (const pod of nextPods) {
    if (!prevPods.has(pod)) {
      out.push(event("success", "Pod created", pod));
    }
  }

  for (const pod of prevPods) {
    if (!nextPods.has(pod)) {
      out.push(event("warn", "Pod removed", pod));
    }
  }

  const prevReadinessByPod = new Map(prev.pods.map((pod) => [pod.name, pod.ready]));
  for (const pod of next.pods) {
    const previousReady = prevReadinessByPod.get(pod.name);
    if (previousReady === undefined || previousReady === pod.ready) {
      continue;
    }
    out.push(
      event(
        pod.ready ? "success" : "warn",
        "Pod readiness changed",
        `${pod.name}: ${previousReady ? "Ready" : "Not Ready"} -> ${pod.ready ? "Ready" : "Not Ready"}`
      )
    );
  }

  if (prev.config?.app_version !== next.config?.app_version && next.config?.app_version) {
    out.push(
      event(
        "success",
        "ConfigMap APP_VERSION changed",
        `${prev.config?.app_version ?? "unknown"} -> ${next.config.app_version}`
      )
    );
  }

  if (prev.config?.initial_readiness !== next.config?.initial_readiness) {
    out.push(
      event(
        next.config?.initial_readiness ? "success" : "warn",
        "Initial readiness policy changed",
        next.config?.initial_readiness ? "Pods should become ready" : "Pods will start unready"
      )
    );
  }

  if (out.length <= 2) {
    return out;
  }

  // Collapse burst into a single summary event to keep the timeline readable.
  const podCreated = out.filter((e) => e.title === "Pod created").length;
  const podRemoved = out.filter((e) => e.title === "Pod removed").length;
  const readinessChanged = out.filter((e) => e.title === "Pod readiness changed").length;
  const other = out.filter(
    (e) => e.title !== "Pod created" && e.title !== "Pod removed" && e.title !== "Pod readiness changed"
  );

  const parts: string[] = [];
  if (podCreated > 0) parts.push(`${podCreated} pod${podCreated > 1 ? "s" : ""} created`);
  if (podRemoved > 0) parts.push(`${podRemoved} pod${podRemoved > 1 ? "s" : ""} removed`);
  if (readinessChanged > 0) parts.push(`${readinessChanged} readiness change${readinessChanged > 1 ? "s" : ""}`);

  const summary = event("info", "Cluster state updated", parts.join(" · ") || undefined);
  return [...other, summary];
}

export function prependTimeline(
  existing: TimelineEvent[],
  additions: TimelineEvent[],
  maxItems = 20
): TimelineEvent[] {
  return [...additions, ...existing].slice(0, maxItems);
}
