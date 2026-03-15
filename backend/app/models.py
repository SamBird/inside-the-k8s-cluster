from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PodState(BaseModel):
    name: str
    phase: str | None = None
    node_name: str | None = None
    pod_ip: str | None = None
    owner_kind: str | None = None
    owner_name: str | None = None
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


class ReplicaSetState(BaseModel):
    name: str
    replicas: int = 0
    available_replicas: int = 0
    ready_replicas: int = 0
    revision: str | None = None
    owner_name: str | None = None
    image: str | None = None
    created_at: datetime | None = None


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


class ServiceEndpointState(BaseModel):
    ip: str
    ready: bool = False
    node_name: str | None = None
    pod_name: str | None = None
    target_ref_kind: str | None = None


class DemoConfigState(BaseModel):
    app_version: str
    initial_readiness: bool


class ClusterState(BaseModel):
    namespace: str
    nodes: list[NodeState] = Field(default_factory=list)
    deployment: DeploymentState
    replica_sets: list[ReplicaSetState] = Field(default_factory=list)
    service: ServiceState
    service_endpoints: list[ServiceEndpointState] = Field(default_factory=list)
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


class TrafficInfoResponse(BaseModel):
    podName: str | None = None
    nodeName: str | None = None
    namespace: str | None = None
    podIP: str | None = None
    imageVersion: str | None = None
    requestCount: int | None = None
    readiness: bool | None = None
    path: str | None = None
    source: Literal["service-proxy"] = "service-proxy"


class ControlPlaneLeaseState(BaseModel):
    name: str
    holder_identity: str | None = None
    renew_time: datetime | None = None
    acquire_time: datetime | None = None
    lease_duration_seconds: int | None = None
    lease_transitions: int | None = None


class ControlPlaneComponentState(BaseModel):
    key: Literal["kube-apiserver", "etcd", "kube-scheduler", "kube-controller-manager"]
    title: str
    what_it_does: str
    when_involved: str
    reconciliation_link: str
    observed: bool = False
    pod_name: str | None = None
    phase: str | None = None
    ready: bool = False
    restart_count: int = 0
    image: str | None = None
    node_name: str | None = None
    pod_ip: str | None = None
    started_at: datetime | None = None
    lease: ControlPlaneLeaseState | None = None
    notes: list[str] = Field(default_factory=list)


class ControlPlaneState(BaseModel):
    namespace: str
    discovered_at: datetime
    control_plane_node_names: list[str] = Field(default_factory=list)
    components: list[ControlPlaneComponentState] = Field(default_factory=list)
    discovery_warnings: list[str] = Field(default_factory=list)
