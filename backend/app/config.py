from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    namespace: str = os.getenv("DEMO_NAMESPACE", "inside-k8s-demo")
    deployment_name: str = os.getenv("DEMO_DEPLOYMENT_NAME", "demo-app")
    service_name: str = os.getenv("DEMO_SERVICE_NAME", "demo-app")
    configmap_name: str = os.getenv("DEMO_CONFIGMAP_NAME", "demo-app-config")
    container_name: str = os.getenv("DEMO_CONTAINER_NAME", "demo-app")
    app_label: str = os.getenv("DEMO_APP_LABEL", "app.kubernetes.io/name=demo-app")
    default_image: str = os.getenv("DEMO_DEFAULT_IMAGE", "demo-app:v1")
    default_version: str = os.getenv("DEMO_DEFAULT_VERSION", "v1")
    sse_watch_timeout_seconds: int = int(os.getenv("SSE_WATCH_TIMEOUT_SECONDS", "25"))
    sse_retry_ms: int = int(os.getenv("SSE_RETRY_MS", "2500"))

    @property
    def manifest_dir(self) -> Path:
        # backend/app/config.py -> repo root -> k8s/demo-app
        return Path(__file__).resolve().parents[2] / "k8s" / "demo-app"


settings = Settings()
