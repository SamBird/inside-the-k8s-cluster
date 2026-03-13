from __future__ import annotations

import ast
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
    ControlPlaneComponentState,
    ControlPlaneLeaseState,
    ControlPlaneState,
    DemoConfigState,
    DeploymentState,
    NodeState,
    PodState,
    ServicePortState,
    ServiceState,
)


class BackendError(RuntimeError):
    pass


CONTROL_PLANE_COMPONENTS: tuple[dict[str, str], ...] = (
    {
        "key": "kube-apiserver",
        "title": "kube-apiserver",
        "what": "Front door for Kubernetes API requests. Validates requests and persists object changes.",
        "when": "Every kubectl apply/patch/scale and every controller write.",
        "reconcile": "Publishes desired state updates that controllers and schedulers react to."
    },
    {
        "key": "etcd",
        "title": "etcd",
        "what": "Distributed key-value store for Kubernetes object state.",
        "when": "Any API read/write of cluster objects.",
        "reconcile": "Source of truth that desired and observed object state are compared against."
    },
    {
        "key": "kube-scheduler",
        "title": "kube-scheduler",
        "what": "Assigns pending Pods to suitable nodes.",
        "when": "Whenever new pods are created without node assignment.",
        "reconcile": "Moves pending workload toward the declared replica count by selecting placement."
    },
    {
        "key": "kube-controller-manager",
        "title": "kube-controller-manager",
        "what": "Runs reconciliation loops for Deployments, ReplicaSets, Nodes, and more.",
        "when": "Continuously, especially after deploy/scale/delete/rollout changes.",
        "reconcile": "Detects drift and issues API updates until actual state matches desired state."
    },
)

LEASE_NAME_BY_COMPONENT = {
    "kube-scheduler": "kube-scheduler",
    "kube-controller-manager": "kube-controller-manager",
}


class KubernetesService:
    def __init__(self, cfg: Settings = settings) -> None:
        self.cfg = cfg
        self.api_client: client.ApiClient | None = None
        self.core: client.CoreV1Api | None = None
        self.apps: client.AppsV1Api | None = None
        self.coordination: client.CoordinationV1Api | None = None

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
        if self.core is not None and self.apps is not None and self.coordination is not None:
            return
        self._load_kube_config()
        self.api_client = client.ApiClient()
        self.core = client.CoreV1Api(self.api_client)
        self.apps = client.AppsV1Api(self.api_client)
        self.coordination = client.CoordinationV1Api(self.api_client)

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

    def get_control_plane_state(self) -> ControlPlaneState:
        self._ensure_clients()
        assert self.core is not None
        assert self.coordination is not None

        kube_system_namespace = "kube-system"
        discovery_warnings: list[str] = []
        control_plane_node_names: list[str] = []

        components: dict[str, ControlPlaneComponentState] = {}
        for descriptor in CONTROL_PLANE_COMPONENTS:
            key = descriptor["key"]
            components[key] = ControlPlaneComponentState(
                key=key,  # type: ignore[arg-type]
                title=descriptor["title"],
                what_it_does=descriptor["what"],
                when_involved=descriptor["when"],
                reconciliation_link=descriptor["reconcile"],
            )

        try:
            nodes_state = self._get_nodes_state()
            control_plane_node_names = [
                node.name
                for node in nodes_state
                if node.role == "control-plane" or "control-plane" in (node.roles or []) or "master" in (node.roles or [])
            ]
        except ApiException as exc:
            discovery_warnings.append(f"Node discovery failed with status={exc.status}")

        pods: list[client.V1Pod] = []
        try:
            pods = self.core.list_namespaced_pod(namespace=kube_system_namespace).items
        except ApiException as exc:
            discovery_warnings.append(
                f"Unable to list control-plane pods from namespace '{kube_system_namespace}' (status={exc.status})."
            )

        for descriptor in CONTROL_PLANE_COMPONENTS:
            key = descriptor["key"]
            component = components[key]
            pod = self._find_control_plane_pod(pods, key)
            if pod is None:
                component.notes.append(
                    f"No pod discovered for {key} in namespace '{kube_system_namespace}'. "
                    "This can happen if RBAC restricts access or when control-plane components are managed outside pod APIs."
                )
                continue

            component.observed = True
            component.pod_name = pod.metadata.name if pod.metadata else None
            component.phase = pod.status.phase if pod.status else None
            component.node_name = pod.spec.node_name if pod.spec else None
            component.pod_ip = pod.status.pod_ip if pod.status else None
            component.started_at = pod.status.start_time if pod.status else None

            if pod.status and pod.status.container_statuses:
                container_statuses = pod.status.container_statuses
                component.ready = all(cs.ready for cs in container_statuses)
                component.restart_count = sum(cs.restart_count for cs in container_statuses)
                component.image = container_statuses[0].image or (
                    pod.spec.containers[0].image if pod.spec and pod.spec.containers else None
                )
            elif pod.spec and pod.spec.containers:
                component.image = pod.spec.containers[0].image

            if component.phase and component.phase != "Running":
                component.notes.append(f"Pod phase is {component.phase}, so this component may not be healthy.")
            if not component.ready:
                component.notes.append("Container readiness is not fully healthy.")
            if component.restart_count > 0:
                component.notes.append(f"Container restart count observed: {component.restart_count}.")

        try:
            leases = self.coordination.list_namespaced_lease(namespace=kube_system_namespace).items
            for component_key, lease_name in LEASE_NAME_BY_COMPONENT.items():
                component = components[component_key]
                lease = self._find_component_lease(leases, lease_name)
                if lease is None:
                    component.notes.append(
                        f"Leader lease '{lease_name}' not discovered in '{kube_system_namespace}'."
                    )
                    continue
                lease_spec = lease.spec
                component.lease = ControlPlaneLeaseState(
                    name=lease.metadata.name if lease.metadata else lease_name,
                    holder_identity=lease_spec.holder_identity if lease_spec else None,
                    renew_time=lease_spec.renew_time if lease_spec else None,
                    acquire_time=lease_spec.acquire_time if lease_spec else None,
                    lease_duration_seconds=lease_spec.lease_duration_seconds if lease_spec else None,
                    lease_transitions=lease_spec.lease_transitions if lease_spec else None,
                )
        except ApiException as exc:
            discovery_warnings.append(
                f"Unable to read leader leases from namespace '{kube_system_namespace}' (status={exc.status})."
            )

        return ControlPlaneState(
            namespace=kube_system_namespace,
            discovered_at=datetime.now(timezone.utc),
            control_plane_node_names=control_plane_node_names,
            components=list(components.values()),
            discovery_warnings=discovery_warnings,
        )

    def get_demo_traffic_info(self) -> dict:
        self._ensure_clients()
        assert self.core is not None
        try:
            service = self.core.read_namespaced_service(self.cfg.service_name, self.cfg.namespace)
        except ApiException as exc:
            if exc.status == 404:
                raise BackendError(f"Service '{self.cfg.service_name}' not found in namespace '{self.cfg.namespace}'")
            raise

        ports = service.spec.ports or []
        if not ports:
            raise BackendError(f"Service '{self.cfg.service_name}' has no ports configured")
        proxy_name = f"{self.cfg.service_name}:{ports[0].port}"

        try:
            raw = self.core.connect_get_namespaced_service_proxy_with_path(
                name=proxy_name,
                namespace=self.cfg.namespace,
                path="info",
            )
        except ApiException as exc:
            if exc.status == 404:
                raise BackendError(f"Service proxy '{proxy_name}' not found in namespace '{self.cfg.namespace}'")
            if exc.status == 503:
                raise BackendError("Demo service has no ready endpoints yet")
            raise

        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")

        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError as exc:
                # Kubernetes proxy responses may arrive as Python-literal dict strings.
                try:
                    parsed = ast.literal_eval(raw)
                except (ValueError, SyntaxError) as parse_exc:
                    raise BackendError(f"Demo service returned invalid JSON: {exc}") from parse_exc
        elif isinstance(raw, dict):
            parsed = raw
        else:
            raise BackendError(f"Unexpected demo service response type: {type(raw).__name__}")

        if not isinstance(parsed, dict):
            raise BackendError("Demo service response is not a JSON object")

        parsed["source"] = "service-proxy"
        return parsed

    @staticmethod
    def _find_control_plane_pod(pods: list[client.V1Pod], component_key: str) -> client.V1Pod | None:
        labeled = [
            pod
            for pod in pods
            if pod.metadata
            and pod.metadata.labels
            and pod.metadata.labels.get("component") == component_key
        ]
        if labeled:
            return sorted(labeled, key=lambda pod: pod.metadata.name or "")[0]

        named = [
            pod
            for pod in pods
            if pod.metadata and pod.metadata.name and pod.metadata.name.startswith(f"{component_key}-")
        ]
        if named:
            return sorted(named, key=lambda pod: pod.metadata.name or "")[0]

        return None

    @staticmethod
    def _find_component_lease(leases: list[client.V1Lease], lease_name: str) -> client.V1Lease | None:
        exact = [lease for lease in leases if lease.metadata and lease.metadata.name == lease_name]
        if exact:
            return exact[0]

        prefix = [
            lease
            for lease in leases
            if lease.metadata and lease.metadata.name and lease.metadata.name.startswith(f"{lease_name}-")
        ]
        if prefix:
            return sorted(prefix, key=lambda lease: lease.metadata.name or "")[0]

        return None

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

    @staticmethod
    def _pod_is_ready(pod: client.V1Pod) -> bool:
        statuses = pod.status.container_statuses if pod.status else None
        if not statuses:
            return False
        return all(container_status.ready for container_status in statuses)

    def _get_running_demo_pods(self) -> list[client.V1Pod]:
        assert self.core is not None
        pods = self.core.list_namespaced_pod(
            namespace=self.cfg.namespace,
            label_selector=self.cfg.app_label,
        ).items
        return sorted(
            [pod for pod in pods if pod.status and pod.status.phase == "Running"],
            key=lambda pod: pod.metadata.name,
        )

    def _proxy_pod_readiness_change(self, pod_name: str, fail: bool) -> None:
        assert self.core is not None
        path = "admin/readiness/fail" if fail else "admin/readiness/restore"
        try:
            self.core.connect_post_namespaced_pod_proxy_with_path(
                name=pod_name,
                namespace=self.cfg.namespace,
                path=path,
                _request_timeout=(2, 5),
            )
        except ApiException as exc:
            raise BackendError(
                f"Failed to update readiness on pod '{pod_name}' via pod proxy "
                f"(status={exc.status}, reason={exc.reason})"
            ) from exc

    def _choose_readiness_failure_target(self, running_pods: list[client.V1Pod]) -> client.V1Pod:
        already_unready = [pod for pod in running_pods if not self._pod_is_ready(pod)]
        candidates = already_unready or [pod for pod in running_pods if self._pod_is_ready(pod)]
        if not candidates:
            raise BackendError("No running demo-app pods found to change readiness on")
        return sorted(
            candidates,
            key=lambda pod: (
                pod.metadata.creation_timestamp or datetime.max.replace(tzinfo=timezone.utc),
                pod.metadata.name,
            ),
        )[0]

    def _set_expected_pod_readiness(self, expected_by_pod: dict[str, bool]) -> None:
        for pod_name, should_be_ready in expected_by_pod.items():
            self._proxy_pod_readiness_change(pod_name, fail=not should_be_ready)

    def _restore_previous_pod_readiness(self, previous_by_pod: dict[str, bool]) -> None:
        try:
            self._set_expected_pod_readiness(previous_by_pod)
            self._wait_for_expected_pod_readiness(
                expected_by_pod=previous_by_pod,
                timeout_seconds=10,
            )
        except Exception:
            pass

    def _wait_for_expected_pod_readiness(
        self,
        expected_by_pod: dict[str, bool],
        timeout_seconds: int = 20,
    ) -> None:
        assert self.core is not None
        deadline = time.time() + timeout_seconds
        pod_names = set(expected_by_pod)

        while time.time() < deadline:
            pods = self.core.list_namespaced_pod(
                namespace=self.cfg.namespace,
                label_selector=self.cfg.app_label,
            ).items
            current = {
                pod.metadata.name: self._pod_is_ready(pod)
                for pod in pods
                if pod.metadata and pod.metadata.name in pod_names
            }
            if current.keys() == pod_names and all(
                current[pod_name] == expected_by_pod[pod_name] for pod_name in sorted(pod_names)
            ):
                return
            time.sleep(1)

        expected_label = ", ".join(
            f"{pod_name}={'Ready' if expected_by_pod[pod_name] else 'NotReady'}"
            for pod_name in sorted(pod_names)
        )
        raise BackendError(
            f"Timed out waiting for pod readiness to converge ({expected_label}). "
            "The container state changed, but kubelet readiness probes did not converge in time."
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
        self._wait_for_rollout(version, timeout_seconds=75)
        return ActionResponse(
            action="rollout_version",
            message=f"Rolled out image demo-app:{version} and APP_VERSION={version}",
            state=self.get_state(),
        )

    def _wait_for_rollout(self, version: str, timeout_seconds: int = 75) -> None:
        assert self.apps is not None
        deadline = time.time() + timeout_seconds
        expected_image = f"demo-app:{version}"

        while time.time() < deadline:
            deployment = self.apps.read_namespaced_deployment(
                name=self.cfg.deployment_name,
                namespace=self.cfg.namespace,
            )
            if self._deployment_is_ready(deployment, expected_image=expected_image):
                return

            failure_reason = self._rollout_failure_reason(expected_image=expected_image)
            if failure_reason:
                raise BackendError(failure_reason)

            time.sleep(2)

        raise BackendError(
            f"Rollout to {expected_image} did not become ready within {timeout_seconds}s. "
            f"If this is a new local image tag, run: make demo-image VERSION={version} && make demo-load VERSION={version}"
        )

    def _deployment_is_ready(self, deployment: client.V1Deployment, expected_image: str) -> bool:
        status = deployment.status
        spec = deployment.spec
        template_spec = spec.template.spec if spec and spec.template else None
        containers = template_spec.containers if template_spec else None
        replicas = spec.replicas if spec and spec.replicas is not None else 0

        template_has_expected_image = False
        for container_def in containers or []:
            if container_def.name == self.cfg.container_name and container_def.image == expected_image:
                template_has_expected_image = True
                break

        if not template_has_expected_image:
            return False

        observed_generation = status.observed_generation if status and status.observed_generation is not None else 0
        generation = deployment.metadata.generation if deployment.metadata and deployment.metadata.generation is not None else 0
        updated_replicas = status.updated_replicas if status and status.updated_replicas is not None else 0
        total_replicas = status.replicas if status and status.replicas is not None else 0
        ready_replicas = status.ready_replicas if status and status.ready_replicas is not None else 0
        available_replicas = status.available_replicas if status and status.available_replicas is not None else 0

        return (
            observed_generation >= generation
            and total_replicas == replicas
            and updated_replicas == replicas
            and ready_replicas == replicas
            and available_replicas == replicas
        )

    def _rollout_failure_reason(self, expected_image: str) -> str | None:
        assert self.core is not None
        pods = self.core.list_namespaced_pod(
            namespace=self.cfg.namespace,
            label_selector=self.cfg.app_label,
        ).items

        image_pull_reasons = {"ErrImagePull", "ImagePullBackOff", "InvalidImageName"}
        crash_reasons = {"CrashLoopBackOff", "CreateContainerConfigError", "CreateContainerError"}

        for pod in pods:
            pod_name = pod.metadata.name if pod.metadata and pod.metadata.name else "<unknown-pod>"
            pod_spec = pod.spec
            pod_status = pod.status

            uses_expected_image = False
            for container_def in (pod_spec.containers if pod_spec and pod_spec.containers else []):
                if container_def.name == self.cfg.container_name and container_def.image == expected_image:
                    uses_expected_image = True
                    break
            if not uses_expected_image:
                continue

            for container_status in (pod_status.container_statuses if pod_status and pod_status.container_statuses else []):
                waiting = container_status.state.waiting if container_status and container_status.state else None
                if not waiting:
                    continue
                reason = waiting.reason or "Unknown"
                message = waiting.message or ""

                if reason in image_pull_reasons:
                    return (
                        f"Rollout failed on pod '{pod_name}' ({reason}). "
                        f"Image '{expected_image}' is likely missing in the local cluster. "
                        f"Build and load it first: make demo-image VERSION={expected_image.removeprefix('demo-app:')} "
                        f"&& make demo-load VERSION={expected_image.removeprefix('demo-app:')}. "
                        f"{message}".strip()
                    )
                if reason in crash_reasons:
                    return (
                        f"Rollout failed on pod '{pod_name}' ({reason}). "
                        f"Check pod logs and probe configuration. "
                        f"{message}".strip()
                    )
        return None

    def toggle_readiness_failure(self, fail: bool) -> ActionResponse:
        self._ensure_clients()
        self._ensure_deployment_exists()

        running_pods = self._get_running_demo_pods()
        if not running_pods:
            raise BackendError("No running demo-app pods found to change readiness on")

        previous_by_pod = {
            pod.metadata.name: self._pod_is_ready(pod)
            for pod in running_pods
            if pod.metadata and pod.metadata.name
        }
        if not previous_by_pod:
            raise BackendError("No running demo-app pods found to change readiness on")

        if fail:
            target_pod = self._choose_readiness_failure_target(running_pods)
            expected_by_pod = {
                pod.metadata.name: pod.metadata.name != target_pod.metadata.name
                for pod in running_pods
                if pod.metadata and pod.metadata.name
            }
            success_message = (
                f"Marked pod {target_pod.metadata.name} NotReady while leaving other running pods Ready"
            )
        else:
            expected_by_pod = {pod_name: True for pod_name in previous_by_pod}
            success_message = "Restored readiness on running demo-app pods without rollout"

        if previous_by_pod == expected_by_pod:
            return ActionResponse(
                action="toggle_readiness_failure",
                message=success_message,
                state=self.get_state(),
            )

        try:
            self._set_expected_pod_readiness(expected_by_pod)
            self._wait_for_expected_pod_readiness(expected_by_pod=expected_by_pod)
        except Exception:
            self._restore_previous_pod_readiness(previous_by_pod)
            raise
        return ActionResponse(
            action="toggle_readiness_failure",
            message=success_message,
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
