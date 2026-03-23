export type ConnectionState = "connecting" | "live" | "degraded";

export interface NodeState {
  name: string;
  ready: boolean;
  role: "control-plane" | "worker" | string;
  roles?: string[];
  kubelet_version?: string | null;
  labels?: Record<string, string>;
}

export interface PodState {
  name: string;
  phase?: string | null;
  node_name?: string | null;
  pod_ip?: string | null;
  owner_kind?: string | null;
  owner_name?: string | null;
  ready: boolean;
  restart_count: number;
  image?: string | null;
  created_at?: string | null;
}

export interface DeploymentState {
  name: string;
  exists: boolean;
  replicas: number;
  available_replicas: number;
  ready_replicas: number;
  observed_generation?: number | null;
}

export interface ReplicaSetState {
  name: string;
  replicas: number;
  available_replicas: number;
  ready_replicas: number;
  revision?: string | null;
  owner_name?: string | null;
  image?: string | null;
  created_at?: string | null;
}

export interface ServicePortState {
  name?: string | null;
  port: number;
  target_port?: string | number | null;
  protocol: string;
}

export interface ServiceState {
  name: string;
  exists: boolean;
  type?: string | null;
  cluster_ip?: string | null;
  ports: ServicePortState[];
}

export interface ServiceEndpointState {
  ip: string;
  ready: boolean;
  node_name?: string | null;
  pod_name?: string | null;
  target_ref_kind?: string | null;
}

export interface DemoConfigState {
  app_version: string;
  initial_readiness: boolean;
}

export interface ClusterState {
  namespace: string;
  nodes: NodeState[];
  deployment: DeploymentState;
  replica_sets: ReplicaSetState[];
  service: ServiceState;
  service_endpoints: ServiceEndpointState[];
  pods: PodState[];
  config?: DemoConfigState | null;
  updated_at: string;
}

export interface ActionResponse {
  action: string;
  message: string;
  state: ClusterState;
}

export interface DesiredState {
  deployed: boolean;
  replicas: number;
  version: string;
  readinessHealthy: boolean;
}

export type TimelineLevel = "info" | "warn" | "error" | "success";

export interface TimelineEvent {
  id: string;
  at: string;
  level: TimelineLevel;
  title: string;
  detail?: string;
}

export interface KubernetesEvent {
  reason: string;
  message: string;
  object_kind: string;
  object_name: string;
  object_namespace?: string | null;
  event_type: "Normal" | "Warning";
  source_component?: string | null;
  source_host?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  count: number;
}

export type ControlPlaneComponent = "kube-apiserver" | "etcd" | "kube-scheduler" | "kube-controller-manager";

export interface DemoTrafficResponse {
  podName?: string;
  nodeName?: string;
  imageVersion?: string;
  requestCount?: number;
  readiness?: boolean;
  path?: string;
  source?: string;
  error?: string;
}

export interface TrafficEvent {
  id: string;
  at: string;
  ok: boolean;
  response: DemoTrafficResponse;
}

