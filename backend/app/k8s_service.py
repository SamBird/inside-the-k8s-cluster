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
    DemoConfigState,
    DeploymentState,
    NodeState,
    PodState,
    ReplicaSetState,
    ServicePortState,
    ServiceEndpointState,
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
    def _load_kube_config() -> str | None:
        kubeconfig_error: Exception | None = None
        try:
            config.load_kube_config()
            return client.Configuration.get_default_copy().host
        except Exception as exc:
            kubeconfig_error = exc

        try:
            config.load_incluster_config()
            return client.Configuration.get_default_copy().host
        except Exception as incluster_error:
            raise BackendError(
                f"Unable to load Kubernetes config (kubeconfig error: {kubeconfig_error}; "
                f"in-cluster error: {incluster_error})"
            ) from incluster_error

    def _require_core(self) -> client.CoreV1Api:
        if self.core is None:
            raise BackendError("Kubernetes client not initialized")
        return self.core

    def _require_apps(self) -> client.AppsV1Api:
        if self.apps is None:
            raise BackendError("Kubernetes client not initialized")
        return self.apps

    def _reset_clients(self) -> None:
        if self.api_client is not None:
            try:
                self.api_client.close()
            except Exception:
                pass
        self.api_client = None
        self.core = None
        self.apps = None

    def _ensure_clients(self) -> None:
        # Fast path: clients already exist, skip kubeconfig file I/O.
        if self.core is not None and self.apps is not None:
            return

        # Slow path: first call or after _reset_clients(). Reload kubeconfig
        # to pick up Kind cluster recreations that change the API server port.
        self._load_kube_config()
        self._reset_clients()
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
        replica_sets_state = self._get_replica_sets_state()
        service_state = self._get_service_state()
        service_endpoints_state = self._get_service_endpoints_state()
        pods_state = self._get_pods_state()
        config_state = self._get_config_state()

        return ClusterState(
            namespace=self.cfg.namespace,
            nodes=nodes_state,
            deployment=deployment_state,
            replica_sets=replica_sets_state,
            service=service_state,
            service_endpoints=service_endpoints_state,
            pods=pods_state,
            config=config_state,
            updated_at=datetime.now(timezone.utc),
        )

    def get_demo_traffic_info(self) -> dict:
        self._ensure_clients()
        core = self._require_core()
        try:
            service = core.read_namespaced_service(self.cfg.service_name, self.cfg.namespace)
        except ApiException as exc:
            if exc.status == 404:
                raise BackendError(f"Service '{self.cfg.service_name}' not found in namespace '{self.cfg.namespace}'")
            raise

        ports = service.spec.ports or []
        if not ports:
            raise BackendError(f"Service '{self.cfg.service_name}' has no ports configured")
        proxy_name = f"{self.cfg.service_name}:{ports[0].port}"

        try:
            raw = core.connect_get_namespaced_service_proxy_with_path(
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

    def _get_nodes_state(self) -> list[NodeState]:
        core = self._require_core()
        nodes = core.list_node()
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
        apps = self._require_apps()
        try:
            dep = apps.read_namespaced_deployment(self.cfg.deployment_name, self.cfg.namespace)
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
        core = self._require_core()
        try:
            svc = core.read_namespaced_service(self.cfg.service_name, self.cfg.namespace)
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

    @staticmethod
    def _owner_reference_name(metadata: client.V1ObjectMeta | None, kind: str) -> str | None:
        if metadata is None or metadata.owner_references is None:
            return None

        for owner_ref in metadata.owner_references:
            if owner_ref.kind == kind:
                return owner_ref.name
        return None

    def _get_replica_sets_state(self) -> list[ReplicaSetState]:
        apps = self._require_apps()
        try:
            replica_sets = apps.list_namespaced_replica_set(
                namespace=self.cfg.namespace,
                label_selector=self.cfg.app_label,
            )
        except ApiException as exc:
            if exc.status == 404:
                return []
            raise

        result: list[ReplicaSetState] = []
        items = sorted(
            replica_sets.items,
            key=lambda rs: (
                rs.metadata.creation_timestamp or datetime.min.replace(tzinfo=timezone.utc),
                rs.metadata.name or "",
            ),
            reverse=True,
        )

        for replica_set in items:
            status = replica_set.status
            template_spec = replica_set.spec.template.spec if replica_set.spec and replica_set.spec.template else None
            containers = template_spec.containers if template_spec else None
            result.append(
                ReplicaSetState(
                    name=replica_set.metadata.name,
                    replicas=replica_set.spec.replicas or 0 if replica_set.spec else 0,
                    available_replicas=status.available_replicas or 0 if status else 0,
                    ready_replicas=status.ready_replicas or 0 if status else 0,
                    revision=(replica_set.metadata.annotations or {}).get("deployment.kubernetes.io/revision"),
                    owner_name=self._owner_reference_name(replica_set.metadata, "Deployment"),
                    image=containers[0].image if containers else None,
                    created_at=replica_set.metadata.creation_timestamp,
                )
            )

        return result

    def _get_service_endpoints_state(self) -> list[ServiceEndpointState]:
        core = self._require_core()
        try:
            endpoints = core.read_namespaced_endpoints(self.cfg.service_name, self.cfg.namespace)
        except ApiException as exc:
            if exc.status == 404:
                return []
            raise

        deduped: dict[tuple[str, str | None, bool], ServiceEndpointState] = {}

        def record(address: client.V1EndpointAddress, ready: bool) -> None:
            target_ref = address.target_ref
            key = (address.ip, target_ref.name if target_ref else None, ready)
            deduped[key] = ServiceEndpointState(
                ip=address.ip,
                ready=ready,
                node_name=address.node_name,
                pod_name=target_ref.name if target_ref and target_ref.kind == "Pod" else None,
                target_ref_kind=target_ref.kind if target_ref else None,
            )

        for subset in endpoints.subsets or []:
            for address in subset.addresses or []:
                record(address, ready=True)
            for address in subset.not_ready_addresses or []:
                record(address, ready=False)

        return sorted(
            deduped.values(),
            key=lambda endpoint: (
                not endpoint.ready,
                endpoint.pod_name or endpoint.ip,
                endpoint.ip,
            ),
        )

    def _get_pods_state(self) -> list[PodState]:
        core = self._require_core()
        try:
            pods = core.list_namespaced_pod(
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
                    owner_kind=pod.metadata.owner_references[0].kind if pod.metadata and pod.metadata.owner_references else None,
                    owner_name=pod.metadata.owner_references[0].name if pod.metadata and pod.metadata.owner_references else None,
                    ready=ready,
                    restart_count=restarts,
                    image=image,
                    created_at=pod.metadata.creation_timestamp,
                )
            )
        return result

    def _get_config_state(self) -> DemoConfigState | None:
        core = self._require_core()
        try:
            cm = core.read_namespaced_config_map(self.cfg.configmap_name, self.cfg.namespace)
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
        apps = self._require_apps()
        body = {"spec": {"replicas": replicas}}
        apps.patch_namespaced_deployment_scale(
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
        core = self._require_core()
        pods = core.list_namespaced_pod(
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

        core.delete_namespaced_pod(
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
        core = self._require_core()
        pods = core.list_namespaced_pod(
            namespace=self.cfg.namespace,
            label_selector=self.cfg.app_label,
        ).items
        return sorted(
            [pod for pod in pods if pod.status and pod.status.phase == "Running"],
            key=lambda pod: pod.metadata.name,
        )

    def _proxy_pod_readiness_change(self, pod_name: str, fail: bool) -> None:
        core = self._require_core()
        path = "admin/readiness/fail" if fail else "admin/readiness/restore"
        try:
            core.connect_post_namespaced_pod_proxy_with_path(
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


    def _image_available_on_nodes(self, image_name: str) -> bool:
        """Check whether at least one cluster node has the given container image."""
        core = self._require_core()
        try:
            nodes = core.list_node()
        except ApiException:
            # If we can't list nodes, skip the check rather than blocking the rollout.
            return True

        for node in nodes.items:
            for img in (node.status.images or []):
                for name in (img.names or []):
                    # Kind loads images as "docker.io/library/demo-app:v2" or "demo-app:v2".
                    if name == image_name or name.endswith(f"/{image_name}"):
                        return True
        return False

    def rollout_version(self, version: str) -> ActionResponse:
        self._ensure_clients()
        self._ensure_deployment_exists()
        self._ensure_configmap_exists()
        core = self._require_core()
        apps = self._require_apps()

        if not version or ":" in version or "/" in version:
            raise BackendError("Version must be a simple tag like 'v2'")

        target_image = f"demo-app:{version}"
        if not self._image_available_on_nodes(target_image):
            raise BackendError(
                f"Image '{target_image}' not found on any cluster node. "
                f"Load it first: make demo-image VERSION={version} && make demo-load VERSION={version}"
            )

        core.patch_namespaced_config_map(
            name=self.cfg.configmap_name,
            namespace=self.cfg.namespace,
            body={"data": {"APP_VERSION": version}},
        )
        apps.patch_namespaced_deployment(
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
        # Return immediately — the SSE stream will push pod transitions as the
        # rolling update progresses. Blocking here hides the reconciliation
        # behaviour the demo exists to show.
        return ActionResponse(
            action="rollout_version",
            message=f"Rollout started: demo-app:{version}. Watch pods update via SSE.",
            state=self.get_state(),
        )


    def toggle_readiness_failure(self, fail: bool) -> ActionResponse:
        self._ensure_clients()
        self._ensure_deployment_exists()

        running_pods = self._get_running_demo_pods()
        if not running_pods:
            raise BackendError("No running demo-app pods found to change readiness on")

        if fail:
            # Pick the first ready pod as the target. If none are ready, use the first running pod.
            ready_pods = [p for p in running_pods if self._pod_is_ready(p)]
            target = (ready_pods or running_pods)[0]
            pod_name = target.metadata.name
            self._proxy_pod_readiness_change(pod_name, fail=True)
            message = f"Marked pod {pod_name} NotReady. SSE will confirm when probe fails."
        else:
            # Restore all running pods to ready.
            for pod in running_pods:
                pod_name = pod.metadata.name
                if pod_name:
                    self._proxy_pod_readiness_change(pod_name, fail=False)
            message = "Restored readiness on all running demo-app pods."

        # Return immediately — kubelet readiness probe interval determines when the
        # pod flips NotReady/Ready in Kubernetes. SSE will push that change.
        return ActionResponse(
            action="toggle_readiness_failure",
            message=message,
            state=self.get_state(),
        )

    def reset_demo(self) -> ActionResponse:
        self._ensure_clients()
        core = self._require_core()
        apps = self._require_apps()
        # Apply base resources without the extra get_state() that deploy_app() does.
        self._ensure_namespace()
        self._apply_configmap()
        self._apply_deployment()
        self._apply_service()
        core.patch_namespaced_config_map(
            name=self.cfg.configmap_name,
            namespace=self.cfg.namespace,
            body={
                "data": {
                    "APP_VERSION": self.cfg.default_version,
                    "INITIAL_READINESS": "true",
                }
            },
        )
        apps.patch_namespaced_deployment(
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
        apps.patch_namespaced_deployment_scale(
            name=self.cfg.deployment_name,
            namespace=self.cfg.namespace,
            body={"spec": {"replicas": 1}},
        )
        ts = datetime.now(timezone.utc).isoformat()
        apps.patch_namespaced_deployment(
            name=self.cfg.deployment_name,
            namespace=self.cfg.namespace,
            body={
                "spec": {
                    "template": {
                        "metadata": {
                            "annotations": {
                                "kubectl.kubernetes.io/restartedAt": ts,
                            }
                        }
                    }
                }
            },
        )
        return ActionResponse(
            action="reset_demo",
            message="Reset to v1, readiness=true, replicas=1",
            state=self.get_state(),
        )

    @staticmethod
    def _k8s_event_to_dict(event: client.CoreV1Event) -> dict:
        involved = event.involved_object
        source = event.source
        return {
            "reason": event.reason or "Unknown",
            "message": event.message or "",
            "object_kind": involved.kind if involved else "Unknown",
            "object_name": involved.name if involved else "Unknown",
            "event_type": event.type or "Normal",
            "source_component": source.component if source else None,
            "first_seen": event.first_timestamp.isoformat() if event.first_timestamp else None,
            "last_seen": event.last_timestamp.isoformat() if event.last_timestamp else None,
            "count": event.count or 1,
        }

    def sse_k8s_events_stream(self) -> Generator[str, None, None]:
        """Stream real Kubernetes events from the demo namespace via SSE."""
        self._ensure_clients()
        core = self._require_core()

        # Send snapshot of recent events on connect.
        try:
            event_list = core.list_namespaced_event(namespace=self.cfg.namespace)
        except ApiException as exc:
            yield self._format_sse("error", {"message": f"k8s_events_list_error status={exc.status}"})
            return

        recent = sorted(
            event_list.items,
            key=lambda e: e.metadata.creation_timestamp or datetime.min.replace(tzinfo=timezone.utc),
        )[-30:]

        for ev in recent:
            yield self._format_sse("k8s_event", self._k8s_event_to_dict(ev))

        # Watch for new events.
        last_emit = time.time()
        min_interval = 1.0
        seen_uids: dict[str, int] = {
            ev.metadata.uid: (ev.count or 1) for ev in recent if ev.metadata.uid
        }

        while True:
            watcher = watch.Watch()
            try:
                stream = watcher.stream(
                    core.list_namespaced_event,
                    namespace=self.cfg.namespace,
                    timeout_seconds=self.cfg.sse_watch_timeout_seconds,
                )
                for watch_event in stream:
                    if watch_event["type"] not in ("ADDED", "MODIFIED"):
                        continue

                    ev = watch_event["object"]
                    uid = ev.metadata.uid
                    count = ev.count or 1

                    # Skip MODIFIED events that haven't incremented count.
                    if uid and uid in seen_uids and count <= seen_uids[uid]:
                        continue
                    if uid:
                        seen_uids[uid] = count
                        # Cap memory: prune when dict grows too large.
                        if len(seen_uids) > 500:
                            seen_uids = dict(list(seen_uids.items())[-250:])

                    now = time.time()
                    if now - last_emit < min_interval:
                        continue

                    yield self._format_sse("k8s_event", self._k8s_event_to_dict(ev))
                    last_emit = now
            except ApiException as exc:
                yield self._format_sse("error", {"message": f"k8s_events_api_error status={exc.status}"})
                time.sleep(1)
            except Exception as exc:
                yield self._format_sse("error", {"message": f"k8s_events_stream_error {type(exc).__name__}: {exc}"})
                time.sleep(1)
            finally:
                watcher.stop()

    def sse_state_stream(self) -> Generator[str, None, None]:
        self._ensure_clients()
        core = self._require_core()
        yield self._format_sse("state", {"state": jsonable_encoder(self.get_state())})

        last_emit = time.time()
        min_interval = 2.0  # seconds — collapses burst events during scale/rollout

        while True:
            watcher = watch.Watch()
            try:
                stream = watcher.stream(
                    core.list_namespaced_pod,
                    namespace=self.cfg.namespace,
                    label_selector=self.cfg.app_label,
                    timeout_seconds=self.cfg.sse_watch_timeout_seconds,
                )
                for _ in stream:
                    now = time.time()
                    if now - last_emit < min_interval:
                        continue
                    payload = {"state": jsonable_encoder(self.get_state())}
                    yield self._format_sse("state", payload)
                    last_emit = time.time()
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

            # Emit one final state after the watch timeout so the UI is always
            # up to date when the cluster is quiet between demo actions.
            payload = {"state": jsonable_encoder(self.get_state())}
            yield self._format_sse("state", payload)
            last_emit = time.time()

    def _ensure_namespace(self) -> None:
        core = self._require_core()
        body = self._manifest("namespace.yaml")
        name = body["metadata"]["name"]
        try:
            core.read_namespace(name)
        except ApiException as exc:
            if exc.status == 404:
                core.create_namespace(body)
            else:
                raise

    def _apply_configmap(self) -> None:
        core = self._require_core()
        body = self._manifest("configmap.yaml")
        name = body["metadata"]["name"]
        try:
            core.read_namespaced_config_map(name, self.cfg.namespace)
            core.patch_namespaced_config_map(name, self.cfg.namespace, body)
        except ApiException as exc:
            if exc.status == 404:
                core.create_namespaced_config_map(self.cfg.namespace, body)
            else:
                raise

    def _apply_deployment(self) -> None:
        apps = self._require_apps()
        body = self._manifest("deployment.yaml")
        name = body["metadata"]["name"]
        try:
            apps.read_namespaced_deployment(name, self.cfg.namespace)
            apps.patch_namespaced_deployment(name, self.cfg.namespace, body)
        except ApiException as exc:
            if exc.status == 404:
                apps.create_namespaced_deployment(self.cfg.namespace, body)
            else:
                raise

    def _apply_service(self) -> None:
        core = self._require_core()
        body = self._manifest("service.yaml")
        name = body["metadata"]["name"]
        try:
            core.read_namespaced_service(name, self.cfg.namespace)
            core.patch_namespaced_service(name, self.cfg.namespace, body)
        except ApiException as exc:
            if exc.status == 404:
                core.create_namespaced_service(self.cfg.namespace, body)
            else:
                raise

    def _ensure_deployment_exists(self) -> None:
        apps = self._require_apps()
        try:
            apps.read_namespaced_deployment(self.cfg.deployment_name, self.cfg.namespace)
        except ApiException as exc:
            if exc.status == 404:
                raise BackendError("Deployment not found. Run deploy action first.") from exc
            raise

    def _ensure_configmap_exists(self) -> None:
        core = self._require_core()
        try:
            core.read_namespaced_config_map(self.cfg.configmap_name, self.cfg.namespace)
        except ApiException as exc:
            if exc.status == 404:
                raise BackendError("ConfigMap not found. Run deploy action first.") from exc
            raise

    def _format_sse(self, event: str, payload: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(payload)}\nretry: {self.cfg.sse_retry_ms}\n\n"
