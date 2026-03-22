import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesiredActualPanel } from "../components/DesiredActualPanel";
import { ClusterState, DesiredState } from "../lib/types";

function makeDesired(overrides: Partial<DesiredState> = {}): DesiredState {
  return {
    deployed: true,
    replicas: 1,
    version: "v1",
    readinessHealthy: true,
    ...overrides,
  };
}

function makeActual(overrides: Partial<ClusterState> = {}): ClusterState {
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
    pods: [],
    config: { app_version: "v1", initial_readiness: true },
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("DesiredActualPanel", () => {
  it("renders all comparison rows", () => {
    render(<DesiredActualPanel desired={makeDesired()} actual={makeActual()} />);

    expect(screen.getByText("Deployment exists")).toBeDefined();
    expect(screen.getByText("Replica target")).toBeDefined();
    expect(screen.getByText("App version")).toBeDefined();
    expect(screen.getByText("Ready pods")).toBeDefined();
    expect(screen.getByText("Readiness config")).toBeDefined();
  });

  it("shows In Sync when all dimensions match", () => {
    render(<DesiredActualPanel desired={makeDesired()} actual={makeActual()} />);

    expect(screen.getByText("In Sync")).toBeDefined();
  });

  it("shows drift when version mismatches", () => {
    const desired = makeDesired({ version: "v2" });
    const actual = makeActual({ config: { app_version: "v1", initial_readiness: true } });
    render(<DesiredActualPanel desired={desired} actual={actual} />);

    const driftBadges = screen.getAllByText("Drift");
    expect(driftBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows drift count in header", () => {
    const desired = makeDesired({ version: "v2", replicas: 3 });
    const actual = makeActual();
    render(<DesiredActualPanel desired={desired} actual={actual} />);

    // Should show "2 Drift Items" or similar
    expect(screen.getByText(/Drift Item/)).toBeDefined();
  });

  it("handles null actual state gracefully", () => {
    render(<DesiredActualPanel desired={makeDesired()} actual={null} />);

    // Should still render the panel header
    expect(screen.getByText("Desired vs Actual State")).toBeDefined();
    // With null actual, all actuals should show defaults (No, 0, unknown, etc.)
    expect(screen.getByText("unknown")).toBeDefined();
  });

  it("shows readiness semantics note", () => {
    render(<DesiredActualPanel desired={makeDesired()} actual={makeActual()} />);

    expect(screen.getByText("Readiness semantics")).toBeDefined();
  });

  it("displays correct desired values", () => {
    const desired = makeDesired({ replicas: 3, version: "v2" });
    render(<DesiredActualPanel desired={desired} actual={makeActual()} />);

    // The desired column should show "3" and "v2"
    expect(screen.getByText("v2")).toBeDefined();
  });
});
