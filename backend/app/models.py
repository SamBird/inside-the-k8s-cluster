from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PodState(BaseModel):
    name: str
    phase: str | None = None
    node_name: str | None = None
    pod_ip: str | None = None
    ready: bool = False
    restart_count: int = 0
    image: str | None = None
    created_at: datetime | None = None


class NodeState(BaseModel):
    name: str
    ready: bool = False
    role: str = "worker"
    roles: list[str] = Field(default_factory=list)
    kubelet_version: str | None = None
    labels: dict[str, str] = Field(default_factory=dict)


class DeploymentState(BaseModel):
    name: str
    exists: bool
    replicas: int = 0
    available_replicas: int = 0
    ready_replicas: int = 0
    observed_generation: int | None = None


class ServicePortState(BaseModel):
    name: str | None = None
    port: int
    target_port: str | int | None = None
    protocol: str = "TCP"


class ServiceState(BaseModel):
    name: str
    exists: bool
    type: str | None = None
    cluster_ip: str | None = None
    ports: list[ServicePortState] = Field(default_factory=list)


class DemoConfigState(BaseModel):
    app_version: str
    initial_readiness: bool


class ClusterState(BaseModel):
    namespace: str
    nodes: list[NodeState] = Field(default_factory=list)
    deployment: DeploymentState
    service: ServiceState
    pods: list[PodState] = Field(default_factory=list)
    config: DemoConfigState | None = None
    updated_at: datetime


class ActionResponse(BaseModel):
    action: str
    message: str
    state: ClusterState


class ScaleRequest(BaseModel):
    replicas: int = Field(ge=1, le=10)


class DeletePodRequest(BaseModel):
    pod_name: str | None = None


class ToggleReadinessRequest(BaseModel):
    fail: bool


class RolloutRequest(BaseModel):
    version: str = Field(min_length=2, max_length=32)


class SSEEnvelope(BaseModel):
    type: Literal["state", "error"]
    state: ClusterState | None = None
    message: str | None = None
