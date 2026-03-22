import { describe, it, expect } from "vitest";
import { diffState, prependTimeline } from "../lib/stateDiff";
import { ClusterState, TimelineEvent } from "../lib/types";

function makeState(overrides: Partial<ClusterState> = {}): ClusterState {
  return {
    namespace: "test",
    nodes: [],
    deployment: {
      name: "demo-app",
      exists: true,
      replicas: 1,
      available_replicas: 1,
      ready_replicas: 1,
    },
    replica_sets: [],
    service: { name: "demo-app", exists: true, ports: [] },
    service_endpoints: [],
    pods: [
      {
        name: "pod-1",
        ready: true,
        restart_count: 0,
      },
    ],
    config: { app_version: "v1", initial_readiness: true },
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("diffState", () => {
  it("returns initial event when prev is null", () => {
    const events = diffState(null, makeState());
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Initial cluster snapshot received");
    expect(events[0].level).toBe("info");
  });

  it("returns empty array when nothing changed", () => {
    const state = makeState();
    const events = diffState(state, state);
    expect(events).toHaveLength(0);
  });

  it("detects deployment creation", () => {
    const prev = makeState({ deployment: { name: "demo-app", exists: false, replicas: 0, available_replicas: 0, ready_replicas: 0 } });
    const next = makeState({ deployment: { name: "demo-app", exists: true, replicas: 1, available_replicas: 1, ready_replicas: 1 } });
    const events = diffState(prev, next);

    const deployEvent = events.find((e) => e.title === "Deployment now exists");
    expect(deployEvent).toBeDefined();
    expect(deployEvent!.level).toBe("success");
  });

  it("detects deployment removal", () => {
    const prev = makeState();
    const next = makeState({ deployment: { name: "demo-app", exists: false, replicas: 0, available_replicas: 0, ready_replicas: 0 } });
    const events = diffState(prev, next);

    const deployEvent = events.find((e) => e.title === "Deployment removed");
    expect(deployEvent).toBeDefined();
    expect(deployEvent!.level).toBe("warn");
  });

  it("detects replica target change", () => {
    const prev = makeState();
    const next = makeState({ deployment: { name: "demo-app", exists: true, replicas: 3, available_replicas: 1, ready_replicas: 1 } });
    const events = diffState(prev, next);

    const replicaEvent = events.find((e) => e.title === "Replica target changed");
    expect(replicaEvent).toBeDefined();
    expect(replicaEvent!.detail).toContain("1 -> 3");
  });

  it("detects pod creation", () => {
    const prev = makeState({ pods: [{ name: "pod-1", ready: true, restart_count: 0 }] });
    const next = makeState({
      pods: [
        { name: "pod-1", ready: true, restart_count: 0 },
        { name: "pod-2", ready: true, restart_count: 0 },
      ],
    });
    const events = diffState(prev, next);

    const podEvent = events.find((e) => e.title === "Pod created");
    expect(podEvent).toBeDefined();
    expect(podEvent!.detail).toBe("pod-2");
  });

  it("detects pod removal", () => {
    const prev = makeState({
      pods: [
        { name: "pod-1", ready: true, restart_count: 0 },
        { name: "pod-2", ready: true, restart_count: 0 },
      ],
    });
    const next = makeState({ pods: [{ name: "pod-1", ready: true, restart_count: 0 }] });
    const events = diffState(prev, next);

    const podEvent = events.find((e) => e.title === "Pod removed");
    expect(podEvent).toBeDefined();
    expect(podEvent!.detail).toBe("pod-2");
  });

  it("detects pod readiness change", () => {
    const prev = makeState({ pods: [{ name: "pod-1", ready: true, restart_count: 0 }] });
    const next = makeState({ pods: [{ name: "pod-1", ready: false, restart_count: 0 }] });
    const events = diffState(prev, next);

    const readyEvent = events.find((e) => e.title === "Pod readiness changed");
    expect(readyEvent).toBeDefined();
    expect(readyEvent!.level).toBe("warn");
    expect(readyEvent!.detail).toContain("Ready -> Not Ready");
  });

  it("detects version change", () => {
    const prev = makeState({ config: { app_version: "v1", initial_readiness: true } });
    const next = makeState({ config: { app_version: "v2", initial_readiness: true } });
    const events = diffState(prev, next);

    const versionEvent = events.find((e) => e.title === "ConfigMap APP_VERSION changed");
    expect(versionEvent).toBeDefined();
    expect(versionEvent!.detail).toContain("v1 -> v2");
  });

  it("collapses burst of >2 events into summary", () => {
    const prev = makeState({
      pods: [{ name: "pod-1", ready: true, restart_count: 0 }],
      deployment: { name: "demo-app", exists: true, replicas: 1, available_replicas: 1, ready_replicas: 1 },
    });
    const next = makeState({
      pods: [
        { name: "pod-2", ready: true, restart_count: 0 },
        { name: "pod-3", ready: true, restart_count: 0 },
        { name: "pod-4", ready: true, restart_count: 0 },
      ],
      deployment: { name: "demo-app", exists: true, replicas: 3, available_replicas: 3, ready_replicas: 3 },
    });
    const events = diffState(prev, next);

    const summaryEvent = events.find((e) => e.title === "Cluster state updated");
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent!.detail).toContain("created");
    expect(summaryEvent!.detail).toContain("removed");
  });
});

describe("prependTimeline", () => {
  function makeEvent(title: string): TimelineEvent {
    return { id: title, at: new Date().toISOString(), level: "info", title };
  }

  it("prepends new events", () => {
    const existing = [makeEvent("old")];
    const additions = [makeEvent("new")];
    const result = prependTimeline(existing, additions);

    expect(result[0].title).toBe("new");
    expect(result[1].title).toBe("old");
  });

  it("respects maxItems", () => {
    const existing = Array.from({ length: 20 }, (_, i) => makeEvent(`old-${i}`));
    const additions = [makeEvent("new")];
    const result = prependTimeline(existing, additions, 20);

    expect(result).toHaveLength(20);
    expect(result[0].title).toBe("new");
  });
});
