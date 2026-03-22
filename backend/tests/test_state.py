"""Tests for KubernetesService state-reading methods.

All K8s client calls are mocked — no cluster required.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from kubernetes.client import ApiException

from tests.conftest import (
    make_configmap,
    make_deployment,
    make_endpoints,
    make_node,
    make_pod,
    make_replica_set,
    make_service,
)


# ---------------------------------------------------------------------------
# _get_nodes_state
# ---------------------------------------------------------------------------


class TestGetNodesState:
    def test_worker_node(self, svc):
        svc.core.list_node.return_value = SimpleNamespace(items=[make_node("w-1")])
        nodes = svc._get_nodes_state()

        assert len(nodes) == 1
        assert nodes[0].name == "w-1"
        assert nodes[0].ready is True
        assert nodes[0].role == "worker"

    def test_control_plane_node(self, svc):
        svc.core.list_node.return_value = SimpleNamespace(
            items=[make_node("cp-1", role="control-plane")]
        )
        nodes = svc._get_nodes_state()

        assert nodes[0].role == "control-plane"
        assert "control-plane" in nodes[0].roles

    def test_not_ready_node(self, svc):
        svc.core.list_node.return_value = SimpleNamespace(
            items=[make_node("w-1", ready=False)]
        )
        nodes = svc._get_nodes_state()
        assert nodes[0].ready is False

    def test_empty_node_list(self, svc):
        svc.core.list_node.return_value = SimpleNamespace(items=[])
        nodes = svc._get_nodes_state()
        assert nodes == []

    def test_nodes_sorted_by_name(self, svc):
        svc.core.list_node.return_value = SimpleNamespace(
            items=[make_node("z-node"), make_node("a-node")]
        )
        nodes = svc._get_nodes_state()
        assert [n.name for n in nodes] == ["a-node", "z-node"]

    def test_selected_labels(self, svc):
        node = make_node("w-1")
        node.metadata.labels["topology.kubernetes.io/zone"] = "local-a"
        svc.core.list_node.return_value = SimpleNamespace(items=[node])

        nodes = svc._get_nodes_state()
        assert "topology.kubernetes.io/zone" in nodes[0].labels


# ---------------------------------------------------------------------------
# _get_deployment_state
# ---------------------------------------------------------------------------


class TestGetDeploymentState:
    def test_existing_deployment(self, svc):
        svc.apps.read_namespaced_deployment.return_value = make_deployment(
            replicas=3, available=2, ready=2, generation=5
        )
        state = svc._get_deployment_state()

        assert state.exists is True
        assert state.replicas == 3
        assert state.available_replicas == 2
        assert state.ready_replicas == 2
        assert state.observed_generation == 5

    def test_deployment_not_found(self, svc):
        svc.apps.read_namespaced_deployment.side_effect = ApiException(status=404)
        state = svc._get_deployment_state()

        assert state.exists is False
        assert state.replicas == 0

    def test_deployment_with_zero_replicas(self, svc):
        dep = make_deployment(replicas=0, available=0, ready=0)
        dep.status.replicas = None  # K8s returns None when 0
        dep.status.available_replicas = None
        dep.status.ready_replicas = None
        svc.apps.read_namespaced_deployment.return_value = dep
        state = svc._get_deployment_state()

        assert state.exists is True
        assert state.replicas == 0
        assert state.available_replicas == 0
        assert state.ready_replicas == 0

    def test_deployment_api_error_propagates(self, svc):
        svc.apps.read_namespaced_deployment.side_effect = ApiException(status=500)
        import pytest
        with pytest.raises(ApiException):
            svc._get_deployment_state()


# ---------------------------------------------------------------------------
# _get_service_state
# ---------------------------------------------------------------------------


class TestGetServiceState:
    def test_existing_service(self, svc):
        svc.core.read_namespaced_service.return_value = make_service()
        state = svc._get_service_state()

        assert state.exists is True
        assert state.type == "ClusterIP"
        assert len(state.ports) == 1
        assert state.ports[0].port == 80

    def test_service_not_found(self, svc):
        svc.core.read_namespaced_service.side_effect = ApiException(status=404)
        state = svc._get_service_state()

        assert state.exists is False


# ---------------------------------------------------------------------------
# _get_pods_state
# ---------------------------------------------------------------------------


class TestGetPodsState:
    def test_running_ready_pod(self, svc):
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[make_pod("pod-1", ready=True, image="demo-app:v1")]
        )
        pods = svc._get_pods_state()

        assert len(pods) == 1
        assert pods[0].name == "pod-1"
        assert pods[0].ready is True
        assert pods[0].phase == "Running"
        assert pods[0].image == "demo-app:v1"

    def test_pending_pod_no_container_statuses(self, svc):
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[make_pod("pod-1", phase="Pending")]
        )
        pods = svc._get_pods_state()

        assert pods[0].phase == "Pending"
        assert pods[0].ready is False
        assert pods[0].image is None

    def test_pod_with_restarts(self, svc):
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[make_pod("pod-1", restart_count=3)]
        )
        pods = svc._get_pods_state()
        assert pods[0].restart_count == 3

    def test_pod_owner_reference(self, svc):
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[make_pod("pod-1", owner_kind="ReplicaSet", owner_name="demo-app-rs")]
        )
        pods = svc._get_pods_state()
        assert pods[0].owner_kind == "ReplicaSet"
        assert pods[0].owner_name == "demo-app-rs"

    def test_pod_without_owner_reference(self, svc):
        pod = make_pod("pod-1")
        pod.metadata.owner_references = None
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(items=[pod])
        pods = svc._get_pods_state()

        assert pods[0].owner_kind is None
        assert pods[0].owner_name is None

    def test_empty_pods(self, svc):
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(items=[])
        pods = svc._get_pods_state()
        assert pods == []

    def test_pods_sorted_by_name(self, svc):
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[make_pod("z-pod"), make_pod("a-pod")]
        )
        pods = svc._get_pods_state()
        assert [p.name for p in pods] == ["a-pod", "z-pod"]

    def test_pods_404_returns_empty(self, svc):
        svc.core.list_namespaced_pod.side_effect = ApiException(status=404)
        pods = svc._get_pods_state()
        assert pods == []


# ---------------------------------------------------------------------------
# _get_config_state
# ---------------------------------------------------------------------------


class TestGetConfigState:
    def test_existing_configmap(self, svc):
        svc.core.read_namespaced_config_map.return_value = make_configmap(
            app_version="v2", initial_readiness="true"
        )
        config = svc._get_config_state()

        assert config is not None
        assert config.app_version == "v2"
        assert config.initial_readiness is True

    def test_configmap_not_found(self, svc):
        svc.core.read_namespaced_config_map.side_effect = ApiException(status=404)
        config = svc._get_config_state()
        assert config is None

    def test_readiness_false(self, svc):
        svc.core.read_namespaced_config_map.return_value = make_configmap(
            initial_readiness="false"
        )
        config = svc._get_config_state()
        assert config.initial_readiness is False

    def test_readiness_truthy_variants(self, svc):
        for value in ("1", "yes", "on", "True", "TRUE"):
            svc.core.read_namespaced_config_map.return_value = make_configmap(
                initial_readiness=value
            )
            config = svc._get_config_state()
            assert config.initial_readiness is True, f"Expected True for '{value}'"

    def test_readiness_falsy_variants(self, svc):
        for value in ("0", "no", "off", "false", "False", "random"):
            svc.core.read_namespaced_config_map.return_value = make_configmap(
                initial_readiness=value
            )
            config = svc._get_config_state()
            assert config.initial_readiness is False, f"Expected False for '{value}'"

    def test_missing_data_keys(self, svc):
        cm = make_configmap()
        cm.data = {}
        svc.core.read_namespaced_config_map.return_value = cm
        config = svc._get_config_state()

        assert config.app_version == "v1"  # falls back to default
        assert config.initial_readiness is True  # default "true" from get() fallback

    def test_none_data(self, svc):
        cm = make_configmap()
        cm.data = None
        svc.core.read_namespaced_config_map.return_value = cm
        config = svc._get_config_state()

        assert config.app_version == "v1"
        assert config.initial_readiness is True


# ---------------------------------------------------------------------------
# _get_replica_sets_state
# ---------------------------------------------------------------------------


class TestGetReplicaSetsState:
    def test_single_replica_set(self, svc):
        svc.apps.list_namespaced_replica_set.return_value = SimpleNamespace(
            items=[make_replica_set("rs-1", replicas=3, available=3, ready=3)]
        )
        rs_list = svc._get_replica_sets_state()

        assert len(rs_list) == 1
        assert rs_list[0].name == "rs-1"
        assert rs_list[0].replicas == 3

    def test_replica_sets_sorted_newest_first(self, svc):
        rs_old = make_replica_set("rs-old", created_at=datetime(2025, 1, 1, tzinfo=timezone.utc))
        rs_new = make_replica_set("rs-new", created_at=datetime(2025, 6, 1, tzinfo=timezone.utc))
        svc.apps.list_namespaced_replica_set.return_value = SimpleNamespace(
            items=[rs_old, rs_new]
        )
        rs_list = svc._get_replica_sets_state()
        assert rs_list[0].name == "rs-new"

    def test_empty_replica_sets(self, svc):
        svc.apps.list_namespaced_replica_set.return_value = SimpleNamespace(items=[])
        rs_list = svc._get_replica_sets_state()
        assert rs_list == []


# ---------------------------------------------------------------------------
# _get_service_endpoints_state
# ---------------------------------------------------------------------------


class TestGetServiceEndpointsState:
    def test_ready_and_not_ready_endpoints(self, svc):
        svc.core.read_namespaced_endpoints.return_value = make_endpoints(
            ready_ips=[("10.0.0.1", "pod-1")],
            not_ready_ips=[("10.0.0.2", "pod-2")],
        )
        endpoints = svc._get_service_endpoints_state()

        assert len(endpoints) == 2
        ready = [e for e in endpoints if e.ready]
        not_ready = [e for e in endpoints if not e.ready]
        assert len(ready) == 1
        assert len(not_ready) == 1
        assert ready[0].pod_name == "pod-1"

    def test_no_endpoints(self, svc):
        svc.core.read_namespaced_endpoints.return_value = SimpleNamespace(subsets=None)
        endpoints = svc._get_service_endpoints_state()
        assert endpoints == []

    def test_endpoints_not_found(self, svc):
        svc.core.read_namespaced_endpoints.side_effect = ApiException(status=404)
        endpoints = svc._get_service_endpoints_state()
        assert endpoints == []


# ---------------------------------------------------------------------------
# get_state (integration of all sub-methods)
# ---------------------------------------------------------------------------


class TestGetState:
    def _wire_defaults(self, svc):
        """Wire all mocks to return a minimal valid cluster state."""
        svc.core.list_node.return_value = SimpleNamespace(items=[make_node()])
        svc.apps.read_namespaced_deployment.return_value = make_deployment()
        svc.apps.list_namespaced_replica_set.return_value = SimpleNamespace(
            items=[make_replica_set()]
        )
        svc.core.read_namespaced_service.return_value = make_service()
        svc.core.read_namespaced_endpoints.return_value = make_endpoints(
            ready_ips=[("10.0.0.1", "pod-1")]
        )
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[make_pod()]
        )
        svc.core.read_namespaced_config_map.return_value = make_configmap()

    def test_full_state_assembles(self, svc):
        self._wire_defaults(svc)
        state = svc.get_state()

        assert state.namespace == "test-ns"
        assert len(state.nodes) == 1
        assert state.deployment.exists is True
        assert len(state.pods) == 1
        assert state.config is not None

    def test_state_with_no_deployment(self, svc):
        self._wire_defaults(svc)
        svc.apps.read_namespaced_deployment.side_effect = ApiException(status=404)

        state = svc.get_state()
        assert state.deployment.exists is False

    def test_state_with_no_configmap(self, svc):
        self._wire_defaults(svc)
        svc.core.read_namespaced_config_map.side_effect = ApiException(status=404)

        state = svc.get_state()
        assert state.config is None
