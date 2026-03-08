import { ActionResponse, ClusterState, ControlPlaneState, DemoTrafficResponse } from "./types";

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function backendUrl(path: string): string {
  return `${backendBase}${path}`;
}

function readErrorMessage(body: unknown): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    return JSON.stringify(detail);
  }
  return "Request failed";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(backendUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new ApiError(response.status, readErrorMessage(parsed));
  }

  return parsed as T;
}

export function getState(): Promise<ClusterState> {
  return requestJson<ClusterState>("/api/state", { method: "GET" });
}

export function deployApp(): Promise<ActionResponse> {
  return requestJson<ActionResponse>("/api/actions/deploy", { method: "POST", body: "{}" });
}

export function scaleDeployment(replicas: number): Promise<ActionResponse> {
  return requestJson<ActionResponse>("/api/actions/scale", {
    method: "POST",
    body: JSON.stringify({ replicas })
  });
}

export function deletePod(pod_name?: string): Promise<ActionResponse> {
  return requestJson<ActionResponse>("/api/actions/delete-pod", {
    method: "POST",
    body: JSON.stringify({ pod_name })
  });
}

export function restartRollout(): Promise<ActionResponse> {
  return requestJson<ActionResponse>("/api/actions/restart-rollout", { method: "POST", body: "{}" });
}

export function rolloutVersion(version: string): Promise<ActionResponse> {
  return requestJson<ActionResponse>("/api/actions/rollout", {
    method: "POST",
    body: JSON.stringify({ version })
  });
}

export function toggleReadiness(fail: boolean): Promise<ActionResponse> {
  return requestJson<ActionResponse>("/api/actions/toggle-readiness", {
    method: "POST",
    body: JSON.stringify({ fail })
  });
}

export function resetDemo(): Promise<ActionResponse> {
  return requestJson<ActionResponse>("/api/actions/reset", { method: "POST", body: "{}" });
}

export function getTrafficInfo(): Promise<DemoTrafficResponse> {
  return requestJson<DemoTrafficResponse>("/api/traffic/info", { method: "GET" });
}

export function getControlPlaneState(): Promise<ControlPlaneState> {
  return requestJson<ControlPlaneState>("/api/control-plane", { method: "GET" });
}

export function subscribeToState(options: {
  onState: (state: ClusterState) => void;
  onError: (message: string) => void;
  onOpen: () => void;
}): () => void {
  const source = new EventSource(backendUrl("/api/events"));

  source.addEventListener("state", (event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data) as { state?: ClusterState };
      if (parsed.state) {
        options.onState(parsed.state);
      }
    } catch (error) {
      options.onError(`Failed to parse state event: ${String(error)}`);
    }
  });

  source.addEventListener("error", (event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data) as { message?: string };
      options.onError(parsed.message ?? "SSE stream error");
    } catch {
      options.onError("SSE stream error");
    }
  });

  source.onopen = () => {
    options.onOpen();
  };

  source.onerror = () => {
    options.onError("Connection lost; browser will retry.");
  };

  return () => {
    source.close();
  };
}
