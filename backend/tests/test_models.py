"""Tests for Pydantic model validation edge cases."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models import (
    ClusterState,
    DeletePodRequest,
    DeploymentState,
    PodState,
    RolloutRequest,
    ScaleRequest,
    ServiceState,
    ToggleReadinessRequest,
)


class TestScaleRequest:
    def test_valid_replicas(self):
        req = ScaleRequest(replicas=3)
        assert req.replicas == 3

    def test_min_replicas(self):
        req = ScaleRequest(replicas=1)
        assert req.replicas == 1

    def test_max_replicas(self):
        req = ScaleRequest(replicas=10)
        assert req.replicas == 10

    def test_zero_replicas_rejected(self):
        with pytest.raises(ValidationError):
            ScaleRequest(replicas=0)

    def test_negative_replicas_rejected(self):
        with pytest.raises(ValidationError):
            ScaleRequest(replicas=-1)

    def test_over_max_rejected(self):
        with pytest.raises(ValidationError):
            ScaleRequest(replicas=11)


class TestRolloutRequest:
    def test_valid_version(self):
        req = RolloutRequest(version="v2")
        assert req.version == "v2"

    def test_too_short_rejected(self):
        with pytest.raises(ValidationError):
            RolloutRequest(version="x")

    def test_max_length(self):
        req = RolloutRequest(version="v" * 32)
        assert len(req.version) == 32

    def test_too_long_rejected(self):
        with pytest.raises(ValidationError):
            RolloutRequest(version="v" * 33)


class TestDeletePodRequest:
    def test_with_name(self):
        req = DeletePodRequest(pod_name="pod-1")
        assert req.pod_name == "pod-1"

    def test_none_name(self):
        req = DeletePodRequest(pod_name=None)
        assert req.pod_name is None

    def test_default_none(self):
        req = DeletePodRequest()
        assert req.pod_name is None


class TestToggleReadinessRequest:
    def test_fail_true(self):
        req = ToggleReadinessRequest(fail=True)
        assert req.fail is True

    def test_fail_false(self):
        req = ToggleReadinessRequest(fail=False)
        assert req.fail is False


class TestPodState:
    def test_defaults(self):
        pod = PodState(name="test")
        assert pod.ready is False
        assert pod.restart_count == 0
        assert pod.phase is None
        assert pod.image is None

    def test_full_pod(self):
        pod = PodState(
            name="pod-1",
            phase="Running",
            node_name="w-1",
            pod_ip="10.0.0.1",
            owner_kind="ReplicaSet",
            owner_name="rs-1",
            ready=True,
            restart_count=2,
            image="demo-app:v1",
        )
        assert pod.ready is True
        assert pod.restart_count == 2


class TestDeploymentState:
    def test_nonexistent(self):
        dep = DeploymentState(name="demo-app", exists=False)
        assert dep.replicas == 0
        assert dep.available_replicas == 0

    def test_existing(self):
        dep = DeploymentState(name="demo-app", exists=True, replicas=3, ready_replicas=2)
        assert dep.replicas == 3
        assert dep.ready_replicas == 2


class TestServiceState:
    def test_nonexistent(self):
        svc = ServiceState(name="demo-app", exists=False)
        assert svc.ports == []
        assert svc.cluster_ip is None
