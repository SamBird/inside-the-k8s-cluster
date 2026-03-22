import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionControls } from "../components/ActionControls";

function defaultProps() {
  return {
    podOptions: ["pod-a", "pod-b"],
    selectedPod: "",
    rolloutVersion: "v2",
    busyAction: null as string | null,
    onSelectPod: vi.fn(),
    onRolloutVersion: vi.fn(),
    onDeploy: vi.fn(),
    onScale1: vi.fn(),
    onScale3: vi.fn(),
    onDeletePod: vi.fn(),
    onBreakReadiness: vi.fn(),
    onRestoreReadiness: vi.fn(),
    onRollout: vi.fn(),
    onReset: vi.fn(),
    onCancelAction: vi.fn(),
  };
}

describe("ActionControls", () => {
  it("renders all action buttons", () => {
    render(<ActionControls {...defaultProps()} />);

    expect(screen.getByText("Deploy app")).toBeDefined();
    expect(screen.getByText("Scale to 1")).toBeDefined();
    expect(screen.getByText("Scale to 3")).toBeDefined();
    expect(screen.getByText("Delete pod")).toBeDefined();
    expect(screen.getByText("Break readiness")).toBeDefined();
    expect(screen.getByText("Restore readiness")).toBeDefined();
    expect(screen.getByText("Rollout new version")).toBeDefined();
    expect(screen.getByText("Reset demo")).toBeDefined();
  });

  it("disables all buttons when busyAction is set", () => {
    render(<ActionControls {...defaultProps()} busyAction="Deploy app" />);

    const buttons = screen.getAllByRole("button");
    // All buttons except "Unlock" should be disabled
    const actionButtons = buttons.filter((b) => b.textContent !== "Unlock");
    for (const button of actionButtons) {
      expect(button).toHaveProperty("disabled", true);
    }
  });

  it("enables all buttons when busyAction is null", () => {
    render(<ActionControls {...defaultProps()} />);

    const buttons = screen.getAllByRole("button");
    for (const button of buttons) {
      expect(button).toHaveProperty("disabled", false);
    }
  });

  it("shows busy status when action is running", () => {
    render(<ActionControls {...defaultProps()} busyAction="Scale to 3" />);

    expect(screen.getByText(/Running now: Scale to 3/)).toBeDefined();
  });

  it("hides busy status when no action is running", () => {
    render(<ActionControls {...defaultProps()} />);

    expect(screen.queryByText(/Running now/)).toBeNull();
  });

  it("fires onDeploy when Deploy button clicked", () => {
    const props = defaultProps();
    render(<ActionControls {...props} />);

    fireEvent.click(screen.getByText("Deploy app"));
    expect(props.onDeploy).toHaveBeenCalledOnce();
  });

  it("fires onReset when Reset button clicked", () => {
    const props = defaultProps();
    render(<ActionControls {...props} />);

    fireEvent.click(screen.getByText("Reset demo"));
    expect(props.onReset).toHaveBeenCalledOnce();
  });

  it("does not fire callbacks when disabled", () => {
    const props = defaultProps();
    render(<ActionControls {...props} busyAction="working" />);

    fireEvent.click(screen.getByText("Deploy app"));
    expect(props.onDeploy).not.toHaveBeenCalled();
  });

  it("renders pod options in dropdown", () => {
    render(<ActionControls {...defaultProps()} />);

    const options = screen.getAllByRole("option");
    const optionTexts = options.map((o) => o.textContent);
    expect(optionTexts).toContain("pod-a");
    expect(optionTexts).toContain("pod-b");
  });

  it("fires onCancelAction when Unlock clicked", () => {
    const props = defaultProps();
    render(<ActionControls {...props} busyAction="working" />);

    fireEvent.click(screen.getByText("Unlock"));
    expect(props.onCancelAction).toHaveBeenCalledOnce();
  });
});
