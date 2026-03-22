"""Shared fixtures for backend tests.

Provides a KubernetesService instance with mocked K8s clients
and factory helpers for building fake K8s API response objects.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.config import Settings
from app.k8s_service import KubernetesService


@pytest.fixture()
def cfg(tmp_path) -> Settings:
    """Settings that point manifest_dir at the real manifests."""
    # We need the real manifests for deploy/reset tests.
    from pathlib import Path

    manifest_dir = Path(__file__).resolve().parents[2] / "k8s" / "demo-app"
    return Settings(
        namespace="test-ns",
        deployment_name="demo-app",
        service_name="demo-app",
        configmap_name="demo-app-config",
        container_name="demo-app",
        app_label="app.kubernetes.io/name=demo-app",
        default_image="demo-app:v1",
        default_version="v1",
    )


@pytest.fixture()
def svc(cfg):
    """A KubernetesService with mocked K8s clients.

    Patches _load_kube_config for the entire test so no real cluster is needed.
    Manually wires api_client, core, and apps as mocks with a matching host
    so _ensure_clients() short-circuits on subsequent calls.
    """
    mock_host = "https://mock:6443"
    patcher = patch.object(KubernetesService, "_load_kube_config", return_value=mock_host)
    patcher.start()

    service = KubernetesService(cfg=cfg)
    # Wire a fake api_client whose configuration.host matches the mock host
    # so _ensure_clients() sees core/apps/host all present and skips re-init.
    fake_api_client = MagicMock()
    fake_api_client.configuration.host = mock_host
    service.api_client = fake_api_client
    service.core = MagicMock()
    service.apps = MagicMock()

    yield service

    patcher.stop()


# ---------------------------------------------------------------------------
# Factory helpers for building fake Kubernetes API response objects
# ---------------------------------------------------------------------------

def make_pod(
    name: str = "demo-app-abc12",
    phase: str = "Running",
    ready: bool = True,
    node_name: str = "worker-1",
    image: str = "demo-app:v1",
    restart_count: int = 0,
    owner_kind: str = "ReplicaSet",
    owner_name: str = "demo-app-rs-abc",
    pod_ip: str = "10.244.0.5",
    created_at: datetime | None = None,
) -> SimpleNamespace:
    """Build a fake V1Pod-like object for testing."""
    return SimpleNamespace(
        metadata=SimpleNamespace(
            name=name,
            creation_timestamp=created_at or datetime(2025, 1, 1, tzinfo=timezone.utc),
            owner_references=[
                SimpleNamespace(kind=owner_kind, name=owner_name)
            ] if owner_kind else None,
            labels={"app.kubernetes.io/name": "demo-app"},
        ),
        spec=SimpleNamespace(node_name=node_name),
        status=SimpleNamespace(
            phase=phase,
            pod_ip=pod_ip,
            container_statuses=[
                SimpleNamespace(
                    ready=ready,
                    restart_count=restart_count,
                    image=image,
                )
            ] if phase != "Pending" else None,
        ),
    )


def make_node(
    name: str = "worker-1",
    ready: bool = True,
    role: str = "worker",
    kubelet_version: str = "v1.31.0",
) -> SimpleNamespace:
    """Build a fake V1Node-like object for testing."""
    labels = {
        "kubernetes.io/hostname": name,
        "kubernetes.io/os": "linux",
        "kubernetes.io/arch": "amd64",
    }
    if role == "control-plane":
        labels["node-role.kubernetes.io/control-plane"] = ""

    conditions = [
        SimpleNamespace(type="Ready", status="True" if ready else "False"),
    ]

    return SimpleNamespace(
        metadata=SimpleNamespace(name=name, labels=labels),
        status=SimpleNamespace(
            conditions=conditions,
            node_info=SimpleNamespace(kubelet_version=kubelet_version),
        ),
    )


def make_deployment(
    name: str = "demo-app",
    replicas: int = 1,
    available: int = 1,
    ready: int = 1,
    generation: int = 1,
) -> SimpleNamespace:
    """Build a fake V1Deployment-like object for testing."""
    return SimpleNamespace(
        metadata=SimpleNamespace(name=name),
        status=SimpleNamespace(
            replicas=replicas,
            available_replicas=available,
            ready_replicas=ready,
            observed_generation=generation,
        ),
    )


def make_service(
    name: str = "demo-app",
    port: int = 80,
    target_port: int = 8080,
) -> SimpleNamespace:
    """Build a fake V1Service-like object for testing."""
    return SimpleNamespace(
        metadata=SimpleNamespace(name=name),
        spec=SimpleNamespace(
            type="ClusterIP",
            cluster_ip="10.96.0.10",
            ports=[
                SimpleNamespace(
                    name="http",
                    port=port,
                    target_port=target_port,
                    protocol="TCP",
                )
            ],
        ),
    )


def make_replica_set(
    name: str = "demo-app-rs-abc",
    replicas: int = 1,
    available: int = 1,
    ready: int = 1,
    revision: str = "1",
    owner_name: str = "demo-app",
    image: str = "demo-app:v1",
    created_at: datetime | None = None,
) -> SimpleNamespace:
    """Build a fake V1ReplicaSet-like object for testing."""
    return SimpleNamespace(
        metadata=SimpleNamespace(
            name=name,
            creation_timestamp=created_at or datetime(2025, 1, 1, tzinfo=timezone.utc),
            annotations={"deployment.kubernetes.io/revision": revision},
            owner_references=[SimpleNamespace(kind="Deployment", name=owner_name)],
        ),
        spec=SimpleNamespace(
            replicas=replicas,
            template=SimpleNamespace(
                spec=SimpleNamespace(
                    containers=[SimpleNamespace(image=image)]
                )
            ),
        ),
        status=SimpleNamespace(
            available_replicas=available,
            ready_replicas=ready,
        ),
    )


def make_configmap(
    name: str = "demo-app-config",
    app_version: str = "v1",
    initial_readiness: str = "true",
) -> SimpleNamespace:
    """Build a fake V1ConfigMap-like object for testing."""
    return SimpleNamespace(
        metadata=SimpleNamespace(name=name),
        data={"APP_VERSION": app_version, "INITIAL_READINESS": initial_readiness},
    )


def make_endpoints(
    ready_ips: list[tuple[str, str]] | None = None,
    not_ready_ips: list[tuple[str, str]] | None = None,
) -> SimpleNamespace:
    """Build a fake V1Endpoints-like object.

    Each entry is (ip, pod_name).
    """
    def addr(ip: str, pod_name: str, node: str = "worker-1") -> SimpleNamespace:
        return SimpleNamespace(
            ip=ip,
            node_name=node,
            target_ref=SimpleNamespace(name=pod_name, kind="Pod"),
        )

    ready_addrs = [addr(ip, pn) for ip, pn in (ready_ips or [])]
    not_ready_addrs = [addr(ip, pn) for ip, pn in (not_ready_ips or [])]

    subsets = []
    if ready_addrs or not_ready_addrs:
        subsets.append(SimpleNamespace(
            addresses=ready_addrs or None,
            not_ready_addresses=not_ready_addrs or None,
        ))

    return SimpleNamespace(subsets=subsets)
