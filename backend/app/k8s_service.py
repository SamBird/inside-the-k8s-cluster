from __future__ import annotations

from datetime import datetime, timezone
import json
import time
from pathlib import Path
from typing import Generator

import yaml
from fastapi.encoders import jsonable_encoder
from kubernetes import client, config, watch
from kubernetes.client import ApiException

from .config import Settings, settings
from .models import (
    ActionResponse,
    ClusterState,
    DemoConfigState,
    DeploymentState,
    NodeState,
    PodState,
    ServicePortState,
    ServiceState,
)


class BackendError(RuntimeError):
    pass


class KubernetesService:
    def __init__(self, cfg: Settings = settings) -> None:
        self.cfg = cfg
        self.api_client: client.ApiClient | None = None
        self.core: client.CoreV1Api | None = None
        self.apps: client.AppsV1Api | None = None

    @staticmethod
    def _load_kube_config() -> None:
        kubeconfig_error: Exception | None = None
        try:
            config.load_kube_config()
            return
        except Exception as exc:
            kubeconfig_error = exc

        try:
            config.load_incluster_config()
            return
        except Exception as incluster_error:
            raise BackendError(
                f"Unable to load Kubernetes config (kubeconfig error: {kubeconfig_error}; "
                f"in-cluster error: {incluster_error})"
            ) from incluster_error

    def _ensure_clients(self) -> None:
        if self.core is not None and self.apps is not None:
            return
        self._load_kube_config()
        self.api_client = client.ApiClient()
        self.core = client.CoreV1Api(self.api_client)
        self.apps = client.AppsV1Api(self.api_client)

    def _manifest(self, name: str) -> dict:
        path = Path(self.cfg.manifest_dir) / name
        with path.open("r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def get_state(self) -> ClusterState:
        self._ensure_clients()
        nodes_state = self._get_nodes_state()
        deployment_state = self._get_deployment_state()
        service_state = self._get_service_state()
        pods_state = self._get_pods_state()
        config_state = self._get_config_state()

        return ClusterState(
            namespace=self.cfg.namespace,
            nodes=nodes_state,
            deployment=deployment_state,
            service=service_state,
            pods=pods_state,
            config=config_state,
            updated_at=datetime.now(timezone.utc),
        )

    def _get_nodes_state(self) -> list[NodeState]:
        assert self.core is not None
        nodes = self.core.list_node()
        result: list[NodeState] = []
        for node in sorted(nodes.items, key=lambda n: n.metadata.name):
            labels = node.metadata.labels or {}
            conditions = node.status.conditions or []
            is_ready = any(c.type == "Ready" and c.status == "True" for c in conditions)

            roles: list[str] = []
            for key in labels:
                if key.startswith("node-role.kubernetes.io/"):
                    roles.append(key.removeprefix("node-role.kubernetes.io/") or "worker")
            if "node-role.kubernetes.io/master" in labels and "master" not in roles:
                roles.append("master")

            role = "worker"
            if "control-plane" in roles or "master" in roles:
                role = "control-plane"
            if not roles:
                roles = [role]

            selected_labels: dict[str, str] = {}
            for label_key in (
                "kubernetes.io/hostname",
                "kubernetes.io/os",
                "kubernetes.io/arch",
                "topology.kubernetes.io/zone",
                "topology.kubernetes.io/region",
            ):
                if label_key in labels:
                    selected_labels[label_key] = str(labels[label_key])

            for key in sorted(labels):
                if key.startswith("node-role.kubernetes.io/"):
                    selected_labels[key] = str(labels[key] or "<set>")

            result.append(
                NodeState(
                    name=node.metadata.name,
                    ready=is_ready,
                    role=role,
                    roles=roles,
                    kubelet_version=(node.status.node_info.kubelet_version if node.status else None),
                    labels=selected_labels,
                )
            )
        return result

    def _get_deployment_state(self) -> DeploymentState:
        assert self.apps is not None
        try:
            dep = self.apps.read_namespaced_deployment(self.cfg.deployment_name, self.cfg.namespace)
            status = dep.status
            return DeploymentState(
                name=dep.metadata.name,
                exists=True,
                replicas=status.replicas or 0,
                available_replicas=status.available_replicas or 0,
                ready_replicas=status.ready_replicas or 0,
                observed_generation=status.observed_generation,
            )
        except ApiException as exc:
            if exc.status == 404:
                return DeploymentState(name=self.cfg.deployment_name, exists=False)
            raise

    def _get_service_state(self) -> ServiceState:
        assert self.core is not None
        try:
            svc = self.core.read_namespaced_service(self.cfg.service_name, self.cfg.namespace)
            ports = [
                ServicePortState(
                    name=p.name,
                    port=p.port,
                    target_port=p.target_port,
                    protocol=p.protocol,
                )
                for p in (svc.spec.ports or [])
            ]
            return ServiceState(
                name=svc.metadata.name,
                exists=True,
                type=svc.spec.type,
                cluster_ip=svc.spec.cluster_ip,
                ports=ports,
            )
        except ApiException as exc:
            if exc.status == 404:
                return ServiceState(name=self.cfg.service_name, exists=False)
            raise

    def _get_pods_state(self) -> list[PodState]:
        assert self.core is not None
        try:
            pods = self.core.list_namespaced_pod(
                namespace=self.cfg.namespace,
                label_selector=self.cfg.app_label,
            )
        except ApiException as exc:
            if exc.status == 404:
                return []
            raise

        result: list[PodState] = []
        for pod in sorted(pods.items, key=lambda p: p.metadata.name):
            ready = False
            restarts = 0
            image = None
            if pod.status and pod.status.container_statuses:
                restarts = sum(cs.restart_count for cs in pod.status.container_statuses)
                image = pod.status.container_statuses[0].image
                ready = all(cs.ready for cs in pod.status.container_statuses)

            result.append(
                PodState(
                    name=pod.metadata.name,
                    phase=pod.status.phase if pod.status else None,
                    node_name=pod.spec.node_name if pod.spec else None,
                    pod_ip=pod.status.pod_ip if pod.status else None,
                    ready=ready,
                    restart_count=restarts,
                    image=image,
                    created_at=pod.metadata.creation_timestamp,
                )
            )
        return result

    def _get_config_state(self) -> DemoConfigState | None:
        assert self.core is not None
        try:
            cm = self.core.read_namespaced_config_map(self.cfg.configmap_name, self.cfg.namespace)
        except ApiException as exc:
            if exc.status == 404:
                return None
            raise

        data = cm.data or {}
        initial = str(data.get("INITIAL_READINESS", "true")).strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        return DemoConfigState(
            app_version=data.get("APP_VERSION", self.cfg.default_version),
            initial_readiness=initial,
        )

    def deploy_app(self) -> ActionResponse:
        self._ensure_clients()
        self._ensure_namespace()
        self._apply_configmap()
        self._apply_deployment()
        self._apply_service()
        return ActionResponse(
            action="deploy_app",
            message="Demo app resources applied",
            state=self.get_state(),
        )

    def scale_deployment(self, replicas: int) -> ActionResponse:
        self._ensure_clients()
        self._ensure_deployment_exists()
        assert self.apps is not None
        body = {"spec": {"replicas": replicas}}
        self.apps.patch_namespaced_deployment_scale(
            name=self.cfg.deployment_name,
            namespace=self.cfg.namespace,
            body=body,
        )
        return ActionResponse(
            action="scale_deployment",
            message=f"Scaled deployment to {replicas}",
            state=self.get_state(),
        )

    def delete_pod(self, pod_name: str | None = None) -> ActionResponse:
        self._ensure_clients()
        assert self.core is not None
        pods = self.core.list_namespaced_pod(
            namespace=self.cfg.namespace,
            label_selector=self.cfg.app_label,
        ).items

        if not pods:
            raise BackendError("No demo pods found to delete")

        target = pod_name
        if target is None:
            running = [p for p in pods if p.status and p.status.phase == "Running"]
            chosen = sorted(running or pods, key=lambda p: p.metadata.creation_timestamp)[0]
            target = chosen.metadata.name
        else:
            demo_pod_names = {p.metadata.name for p in pods}
            if target not in demo_pod_names:
                raise BackendError(f"Pod '{target}' is not a current demo-app pod")

        self.core.delete_namespaced_pod(
            name=target,
            namespace=self.cfg.namespace,
            grace_period_seconds=0,
        )
        return ActionResponse(
            action="delete_pod",
            message=f"Deleted pod {target}",
            state=self.get_state(),
        )

    def restart_rollout(self) -> ActionResponse:
        self._ensure_clients()
        self._ensure_deployment_exists()
        assert self.apps is not None
        ts = datetime.now(timezone.utc).isoformat()
        body = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": ts,
                        }
                    }
                }
            }
        }
        self.apps.patch_namespaced_deployment(
            name=self.cfg.deployment_name,
            namespace=self.cfg.namespace,
            body=body,
        )
        return ActionResponse(
            action="restart_rollout",
            message="Triggered Deployment rollout restart",
            state=self.get_state(),
        )

    def rollout_version(self, version: str) -> ActionResponse:
        self._ensure_clients()
        self._ensure_deployment_exists()
        self._ensure_configmap_exists()
        assert self.apps is not None
        assert self.core is not None

        if not version or ":" in version or "/" in version:
            raise BackendError("Version must be a simple tag like 'v2'")

        self.core.patch_namespaced_config_map(
            name=self.cfg.configmap_name,
            namespace=self.cfg.namespace,
            body={"data": {"APP_VERSION": version}},
        )
        self.apps.patch_namespaced_deployment(
            name=self.cfg.deployment_name,
            namespace=self.cfg.namespace,
            body={
                "spec": {
                    "template": {
                        "spec": {
                            "containers": [
                                {
                                    "name": self.cfg.container_name,
                                    "image": f"demo-app:{version}",
                                }
                            ]
                        }
                    }
                }
            },
        )
        return ActionResponse(
            action="rollout_version",
            message=f"Rolled out image demo-app:{version} and APP_VERSION={version}",
            state=self.get_state(),
        )

    def toggle_readiness_failure(self, fail: bool) -> ActionResponse:
        self._ensure_clients()
        self._ensure_configmap_exists()
        assert self.core is not None
        readiness_value = "false" if fail else "true"
        patch = {"data": {"INITIAL_READINESS": readiness_value}}
        self.core.patch_namespaced_config_map(
            name=self.cfg.configmap_name,
            namespace=self.cfg.namespace,
            body=patch,
        )
        self.restart_rollout()
        return ActionResponse(
            action="toggle_readiness_failure",
            message=f"Set INITIAL_READINESS={readiness_value} and restarted rollout",
            state=self.get_state(),
        )

    def reset_demo(self) -> ActionResponse:
        self._ensure_clients()
        self.deploy_app()
        assert self.core is not None
        assert self.apps is not None
        self.core.patch_namespaced_config_map(
            name=self.cfg.configmap_name,
            namespace=self.cfg.namespace,
            body={
                "data": {
                    "APP_VERSION": self.cfg.default_version,
                    "INITIAL_READINESS": "true",
                }
            },
        )
        self.apps.patch_namespaced_deployment(
            name=self.cfg.deployment_name,
            namespace=self.cfg.namespace,
            body={
                "spec": {
                    "template": {
                        "spec": {
                            "containers": [
                                {
                                    "name": self.cfg.container_name,
                                    "image": self.cfg.default_image,
                                }
                            ]
                        }
                    }
                }
            },
        )
        self.apps.patch_namespaced_deployment_scale(
            name=self.cfg.deployment_name,
            namespace=self.cfg.namespace,
            body={"spec": {"replicas": 1}},
        )
        self.restart_rollout()
        return ActionResponse(
            action="reset_demo",
            message="Reset to v1, readiness=true, replicas=1",
            state=self.get_state(),
        )

    def sse_state_stream(self) -> Generator[str, None, None]:
        self._ensure_clients()
        assert self.core is not None
        yield self._format_sse("state", {"state": jsonable_encoder(self.get_state())})

        while True:
            watcher = watch.Watch()
            try:
                stream = watcher.stream(
                    self.core.list_namespaced_pod,
                    namespace=self.cfg.namespace,
                    label_selector=self.cfg.app_label,
                    timeout_seconds=self.cfg.sse_watch_timeout_seconds,
                )
                for _ in stream:
                    payload = {"state": jsonable_encoder(self.get_state())}
                    yield self._format_sse("state", payload)
            except ApiException as exc:
                payload = {"message": f"kubernetes_api_error status={exc.status}"}
                yield self._format_sse("error", payload)
                time.sleep(1)
            except Exception as exc:  # pragma: no cover - defensive stream handling
                payload = {"message": f"stream_error {type(exc).__name__}: {exc}"}
                yield self._format_sse("error", payload)
                time.sleep(1)
            finally:
                watcher.stop()

            # timeout heartbeat so clients still receive updates when cluster is quiet
            payload = {"state": jsonable_encoder(self.get_state())}
            yield self._format_sse("state", payload)

    def _ensure_namespace(self) -> None:
        assert self.core is not None
        body = self._manifest("namespace.yaml")
        name = body["metadata"]["name"]
        try:
            self.core.read_namespace(name)
        except ApiException as exc:
            if exc.status == 404:
                self.core.create_namespace(body)
            else:
                raise

    def _apply_configmap(self) -> None:
        assert self.core is not None
        body = self._manifest("configmap.yaml")
        name = body["metadata"]["name"]
        try:
            self.core.read_namespaced_config_map(name, self.cfg.namespace)
            self.core.patch_namespaced_config_map(name, self.cfg.namespace, body)
        except ApiException as exc:
            if exc.status == 404:
                self.core.create_namespaced_config_map(self.cfg.namespace, body)
            else:
                raise

    def _apply_deployment(self) -> None:
        assert self.apps is not None
        body = self._manifest("deployment.yaml")
        name = body["metadata"]["name"]
        try:
            self.apps.read_namespaced_deployment(name, self.cfg.namespace)
            self.apps.patch_namespaced_deployment(name, self.cfg.namespace, body)
        except ApiException as exc:
            if exc.status == 404:
                self.apps.create_namespaced_deployment(self.cfg.namespace, body)
            else:
                raise

    def _apply_service(self) -> None:
        assert self.core is not None
        body = self._manifest("service.yaml")
        name = body["metadata"]["name"]
        try:
            self.core.read_namespaced_service(name, self.cfg.namespace)
            self.core.patch_namespaced_service(name, self.cfg.namespace, body)
        except ApiException as exc:
            if exc.status == 404:
                self.core.create_namespaced_service(self.cfg.namespace, body)
            else:
                raise

    def _ensure_deployment_exists(self) -> None:
        assert self.apps is not None
        try:
            self.apps.read_namespaced_deployment(self.cfg.deployment_name, self.cfg.namespace)
        except ApiException as exc:
            if exc.status == 404:
                raise BackendError("Deployment not found. Run deploy action first.") from exc
            raise

    def _ensure_configmap_exists(self) -> None:
        assert self.core is not None
        try:
            self.core.read_namespaced_config_map(self.cfg.configmap_name, self.cfg.namespace)
        except ApiException as exc:
            if exc.status == 404:
                raise BackendError("ConfigMap not found. Run deploy action first.") from exc
            raise

    def _format_sse(self, event: str, payload: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(payload)}\nretry: {self.cfg.sse_retry_ms}\n\n"
