import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from kubernetes.client import ApiException

from .k8s_service import BackendError, KubernetesService
from .models import (
    ActionResponse,
    ClusterState,
    DeletePodRequest,
    RolloutRequest,
    ScaleRequest,
    ToggleReadinessRequest,
    TrafficInfoResponse,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="inside-the-k8s backend", version="0.1.0")
service = KubernetesService()

# Local-first demo; permissive CORS keeps frontend integration friction low.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _is_connection_error(exc: Exception) -> bool:
    """Check if an exception indicates a lost connection to the K8s API server."""
    err_type = type(exc).__name__
    return any(keyword in err_type for keyword in ("Connection", "MaxRetry", "Timeout", "URLError"))


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return the actual error message for unhandled exceptions.

    Helps debugging during live demos. Also resets K8s clients on connection
    errors so the next request reloads kubeconfig (handles Kind cluster recreation).
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    if _is_connection_error(exc):
        service._reset_clients()
    status = 503 if _is_connection_error(exc) else 500
    return JSONResponse(
        status_code=status,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.get("/api/state", response_model=ClusterState)
def current_state() -> ClusterState:
    try:
        return service.get_state()
    except BackendError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc



@app.get("/api/events")
def events() -> StreamingResponse:
    try:
        # Fail fast so frontend gets a clear HTTP status if Kubernetes is unavailable.
        service.get_state()
    except BackendError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc
    return StreamingResponse(service.sse_state_stream(), media_type="text/event-stream")


@app.get("/api/events/k8s")
def k8s_events() -> StreamingResponse:
    try:
        service.get_state()
    except BackendError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc
    return StreamingResponse(service.sse_k8s_events_stream(), media_type="text/event-stream")


@app.get("/api/traffic/info", response_model=TrafficInfoResponse)
def traffic_info() -> TrafficInfoResponse:
    try:
        return TrafficInfoResponse(**service.get_demo_traffic_info())
    except BackendError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc


@app.post("/api/actions/deploy", response_model=ActionResponse)
def deploy_app() -> ActionResponse:
    try:
        return service.deploy_app()
    except BackendError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc


@app.post("/api/actions/scale", response_model=ActionResponse)
def scale(req: ScaleRequest) -> ActionResponse:
    try:
        return service.scale_deployment(req.replicas)
    except BackendError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc


@app.post("/api/actions/delete-pod", response_model=ActionResponse)
def delete_pod(req: DeletePodRequest) -> ActionResponse:
    try:
        return service.delete_pod(req.pod_name)
    except BackendError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc



@app.post("/api/actions/rollout", response_model=ActionResponse)
def rollout(req: RolloutRequest) -> ActionResponse:
    try:
        return service.rollout_version(req.version)
    except BackendError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc


@app.post("/api/actions/toggle-readiness", response_model=ActionResponse)
def toggle_readiness(req: ToggleReadinessRequest) -> ActionResponse:
    try:
        return service.toggle_readiness_failure(req.fail)
    except BackendError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc


@app.post("/api/actions/reset", response_model=ActionResponse)
def reset_demo() -> ActionResponse:
    try:
        return service.reset_demo()
    except BackendError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"kubernetes_api_error status={exc.status}") from exc
