# Kubernetes Config

This folder contains Kubernetes configuration for local demo execution.

Current contents:

- `kind-config.yaml`: default kind cluster topology (1 control-plane, 2 workers)
- `demo-app/`: namespace + Deployment + Service manifests for the teaching app

Design goal:

- keep manifests local-first and deterministic for live demos
