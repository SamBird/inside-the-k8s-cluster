"""Tests for KubernetesService action methods.

Validates deploy, scale, delete-pod, rollout, toggle-readiness, and reset
with mocked K8s clients. No cluster required.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from kubernetes.client import ApiException

from app.k8s_service import BackendError
from tests.conftest import (
    make_configmap,
    make_deployment,
    make_endpoints,
    make_node,
    make_pod,
    make_replica_set,
    make_service,
)


def wire_defaults(svc):
    """Wire all read mocks to return minimal valid state."""
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


# ---------------------------------------------------------------------------
# deploy_app
# ---------------------------------------------------------------------------


class TestDeployApp:
    def test_deploy_creates_resources(self, svc):
        wire_defaults(svc)
        # Simulate first deploy — all reads return 404, then create succeeds
        svc.core.read_namespace.side_effect = ApiException(status=404)
        svc.core.create_namespace.return_value = None
        svc.core.read_namespaced_config_map.side_effect = [
            ApiException(status=404),  # _apply_configmap read
            make_configmap(),  # get_state() call
        ]
        svc.core.create_namespaced_config_map.return_value = None
        svc.apps.read_namespaced_deployment.side_effect = [
            ApiException(status=404),  # _apply_deployment read
            make_deployment(),  # get_state() call
        ]
        svc.apps.create_namespaced_deployment.return_value = None
        svc.core.read_namespaced_service.side_effect = [
            ApiException(status=404),  # _apply_service read
            make_service(),  # get_state() call
        ]
        svc.core.create_namespaced_service.return_value = None

        result = svc.deploy_app()
        assert result.action == "deploy_app"
        assert result.state is not None
        svc.core.create_namespace.assert_called_once()
        svc.core.create_namespaced_config_map.assert_called_once()

    def test_deploy_patches_existing_resources(self, svc):
        wire_defaults(svc)
        # Namespace exists, all resources exist — patch path
        svc.core.read_namespace.return_value = SimpleNamespace()

        result = svc.deploy_app()
        assert result.action == "deploy_app"
        svc.core.patch_namespaced_config_map.assert_called()
        svc.apps.patch_namespaced_deployment.assert_called()
        svc.core.patch_namespaced_service.assert_called()


# ---------------------------------------------------------------------------
# scale_deployment
# ---------------------------------------------------------------------------


class TestScaleDeployment:
    def test_scale_up(self, svc):
        wire_defaults(svc)
        result = svc.scale_deployment(3)

        assert result.action == "scale_deployment"
        assert "3" in result.message
        svc.apps.patch_namespaced_deployment_scale.assert_called_once()
        call_body = svc.apps.patch_namespaced_deployment_scale.call_args
        assert call_body.kwargs["body"]["spec"]["replicas"] == 3

    def test_scale_to_same_value(self, svc):
        wire_defaults(svc)
        result = svc.scale_deployment(1)

        # Should still succeed — idempotent
        assert result.action == "scale_deployment"

    def test_scale_without_deployment_fails(self, svc):
        wire_defaults(svc)
        svc.apps.read_namespaced_deployment.side_effect = ApiException(status=404)

        with pytest.raises(BackendError, match="Deployment not found"):
            svc.scale_deployment(3)


# ---------------------------------------------------------------------------
# delete_pod
# ---------------------------------------------------------------------------


class TestDeletePod:
    def test_delete_named_pod(self, svc):
        wire_defaults(svc)
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[make_pod("pod-a"), make_pod("pod-b")]
        )
        result = svc.delete_pod("pod-a")

        assert result.action == "delete_pod"
        assert "pod-a" in result.message
        svc.core.delete_namespaced_pod.assert_called_once()

    def test_delete_auto_selects_oldest_running(self, svc):
        wire_defaults(svc)
        from datetime import datetime, timezone

        old_pod = make_pod("old-pod", created_at=datetime(2025, 1, 1, tzinfo=timezone.utc))
        new_pod = make_pod("new-pod", created_at=datetime(2025, 6, 1, tzinfo=timezone.utc))
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[new_pod, old_pod]
        )
        result = svc.delete_pod(None)
        assert "old-pod" in result.message

    def test_delete_nonexistent_pod_fails(self, svc):
        wire_defaults(svc)
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[make_pod("pod-a")]
        )
        with pytest.raises(BackendError, match="not a current demo-app pod"):
            svc.delete_pod("nonexistent-pod")

    def test_delete_no_pods_fails(self, svc):
        wire_defaults(svc)
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(items=[])

        with pytest.raises(BackendError, match="No demo pods found"):
            svc.delete_pod(None)


# ---------------------------------------------------------------------------
# rollout_version
# ---------------------------------------------------------------------------


class TestRolloutVersion:
    def test_rollout_valid_version(self, svc):
        wire_defaults(svc)
        with patch.object(svc, "_image_available_on_nodes", return_value=True):
            result = svc.rollout_version("v2")

        assert result.action == "rollout_version"
        assert "v2" in result.message
        svc.core.patch_namespaced_config_map.assert_called()
        svc.apps.patch_namespaced_deployment.assert_called()

    def test_rollout_rejects_colon(self, svc):
        wire_defaults(svc)
        with pytest.raises(BackendError, match="simple tag"):
            svc.rollout_version("repo:v2")

    def test_rollout_rejects_slash(self, svc):
        wire_defaults(svc)
        with pytest.raises(BackendError, match="simple tag"):
            svc.rollout_version("repo/v2")

    def test_rollout_without_deployment_fails(self, svc):
        wire_defaults(svc)
        svc.apps.read_namespaced_deployment.side_effect = ApiException(status=404)

        with pytest.raises(BackendError, match="Deployment not found"):
            svc.rollout_version("v2")

    def test_rollout_without_configmap_fails(self, svc):
        wire_defaults(svc)
        # First call succeeds (deployment check), second fails (configmap check)
        svc.core.read_namespaced_config_map.side_effect = [
            ApiException(status=404),  # _ensure_configmap_exists
        ]
        with pytest.raises(BackendError, match="ConfigMap not found"):
            svc.rollout_version("v2")

    def test_rollout_image_not_found_fails(self, svc):
        wire_defaults(svc)
        with patch.object(svc, "_image_available_on_nodes", return_value=False):
            with pytest.raises(BackendError, match="not found on any cluster node"):
                svc.rollout_version("v99")

    def test_rollout_image_check_skipped_on_api_error(self, svc):
        """If listing nodes fails, the image check is skipped (returns True)."""
        wire_defaults(svc)
        svc.core.list_node.side_effect = ApiException(status=500)
        # _image_available_on_nodes should return True (graceful skip)
        assert svc._image_available_on_nodes("demo-app:v2") is True


# ---------------------------------------------------------------------------
# toggle_readiness_failure
# ---------------------------------------------------------------------------


class TestToggleReadiness:
    def test_break_readiness_targets_first_ready_pod(self, svc):
        wire_defaults(svc)
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[
                make_pod("pod-a", ready=True),
                make_pod("pod-b", ready=True),
            ]
        )
        svc.core.connect_post_namespaced_pod_proxy_with_path.return_value = None

        result = svc.toggle_readiness_failure(fail=True)
        assert "pod-a" in result.message
        svc.core.connect_post_namespaced_pod_proxy_with_path.assert_called_once()
        call_kwargs = svc.core.connect_post_namespaced_pod_proxy_with_path.call_args.kwargs
        assert "fail" in call_kwargs["path"]

    def test_restore_readiness_all_pods(self, svc):
        wire_defaults(svc)
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[
                make_pod("pod-a", ready=False),
                make_pod("pod-b", ready=True),
            ]
        )
        svc.core.connect_post_namespaced_pod_proxy_with_path.return_value = None

        result = svc.toggle_readiness_failure(fail=False)
        assert "Restored" in result.message
        assert svc.core.connect_post_namespaced_pod_proxy_with_path.call_count == 2

    def test_toggle_no_running_pods_fails(self, svc):
        wire_defaults(svc)
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(items=[])

        with pytest.raises(BackendError, match="No running demo-app pods"):
            svc.toggle_readiness_failure(fail=True)

    def test_toggle_proxy_failure_raises(self, svc):
        wire_defaults(svc)
        svc.core.list_namespaced_pod.return_value = SimpleNamespace(
            items=[make_pod("pod-a")]
        )
        svc.core.connect_post_namespaced_pod_proxy_with_path.side_effect = ApiException(
            status=500, reason="Internal Server Error"
        )
        with pytest.raises(BackendError, match="Failed to update readiness"):
            svc.toggle_readiness_failure(fail=True)


# ---------------------------------------------------------------------------
# reset_demo
# ---------------------------------------------------------------------------


class TestResetDemo:
    def test_reset_calls_expected_sequence(self, svc):
        wire_defaults(svc)
        svc.core.read_namespace.return_value = SimpleNamespace()

        result = svc.reset_demo()
        assert result.action == "reset_demo"
        assert "v1" in result.message

        # Verify key reset operations were called
        svc.apps.patch_namespaced_deployment_scale.assert_called()
        scale_body = svc.apps.patch_namespaced_deployment_scale.call_args.kwargs["body"]
        assert scale_body["spec"]["replicas"] == 1

    def test_reset_sets_configmap_to_defaults(self, svc):
        wire_defaults(svc)
        svc.core.read_namespace.return_value = SimpleNamespace()

        svc.reset_demo()

        # Find the configmap patch call that sets APP_VERSION
        for call in svc.core.patch_namespaced_config_map.call_args_list:
            body = call.args[2] if len(call.args) > 2 else call.kwargs.get("body")
            if body and isinstance(body, dict) and "data" in body:
                if "APP_VERSION" in body["data"]:
                    assert body["data"]["APP_VERSION"] == "v1"
                    assert body["data"]["INITIAL_READINESS"] == "true"
                    return
        pytest.fail("Expected configmap patch with APP_VERSION=v1 not found")


# ---------------------------------------------------------------------------
# _format_sse
# ---------------------------------------------------------------------------


class TestFormatSSE:
    def test_sse_format(self, svc):
        result = svc._format_sse("state", {"key": "value"})
        assert result.startswith("event: state\n")
        assert '"key": "value"' in result
        assert "retry:" in result
        assert result.endswith("\n\n")


# ---------------------------------------------------------------------------
# get_demo_traffic_info
# ---------------------------------------------------------------------------


class TestGetDemoTrafficInfo:
    def test_traffic_info_success(self, svc):
        svc.core.read_namespaced_service.return_value = make_service()
        svc.core.connect_get_namespaced_service_proxy_with_path.return_value = (
            '{"podName": "pod-1", "nodeName": "worker-1", "readiness": true}'
        )
        result = svc.get_demo_traffic_info()

        assert result["podName"] == "pod-1"
        assert result["source"] == "service-proxy"

    def test_traffic_info_service_not_found(self, svc):
        svc.core.read_namespaced_service.side_effect = ApiException(status=404)

        with pytest.raises(BackendError, match="not found"):
            svc.get_demo_traffic_info()

    def test_traffic_info_no_ready_endpoints(self, svc):
        svc.core.read_namespaced_service.return_value = make_service()
        svc.core.connect_get_namespaced_service_proxy_with_path.side_effect = ApiException(
            status=503
        )
        with pytest.raises(BackendError, match="no ready endpoints"):
            svc.get_demo_traffic_info()

    def test_traffic_info_invalid_json(self, svc):
        svc.core.read_namespaced_service.return_value = make_service()
        svc.core.connect_get_namespaced_service_proxy_with_path.return_value = "not json at all {"

        with pytest.raises(BackendError, match="invalid JSON"):
            svc.get_demo_traffic_info()
