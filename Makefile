SHELL := /bin/bash

CLUSTER_NAME ?= inside-k8s
KUBE_CONTEXT ?= kind-$(CLUSTER_NAME)
KIND_CONFIG ?= k8s/kind-config.yaml
NAMESPACE ?= inside-k8s-demo
VERSION ?= v1
NEW_VERSION ?= v2
PRELOAD_ROLLOUT_VERSIONS ?= v2

.PHONY: help preflight cluster-up cluster-down cluster-reset metrics-server install-metrics verify-structure demo-image demo-load demo-deploy demo-wait demo-rollout demo-status demo-up demo-all demo-all-down demo-stop golden-reset rehearsal-check backend-install backend-run frontend-install frontend-run

help:
	@echo "Targets:"
	@echo "  make preflight          Verify local toolchain and runtime prerequisites"
	@echo "  make cluster-up         Create local kind cluster and install metrics-server"
	@echo "  make cluster-down       Delete local kind cluster"
	@echo "  make cluster-reset      Recreate the cluster from scratch"
	@echo "  make metrics-server     Install or refresh metrics-server"
	@echo "  make verify-structure   Check required repo directories"
	@echo "  make demo-image VERSION=v1   Build demo app image"
	@echo "  make demo-load VERSION=v1    Load demo app image into kind"
	@echo "  make demo-deploy             Apply demo app manifests"
	@echo "  make demo-wait               Wait for demo deployment rollout"
	@echo "  make demo-rollout NEW_VERSION=v2  Roll Deployment image + APP_VERSION"
	@echo "  make demo-status             Show demo namespace resources"
	@echo "  make demo-up VERSION=v1      Build, load, deploy, and show demo status"
	@echo "  make demo-all VERSION=v1     One-command end-to-end live-demo orchestration"
	@echo "                               preloads rollout tags (default PRELOAD_ROLLOUT_VERSIONS=v2)"
	@echo "                               (set AUTO_START_COLIMA=0 to disable colima auto-start)"
	@echo "  make demo-all-down           One-command full teardown for local demo stack"
	@echo "                               (set STOP_COLIMA=1 to also stop colima)"
	@echo "  make demo-stop               Stop local backend/frontend processes started by demo-all"
	@echo "  make golden-reset            Return cluster/demo-app to presentation baseline (v1, replicas=1, readiness healthy)"
	@echo "  make rehearsal-check         Run pre-talk readiness checks for cluster/backend/frontend/traffic/scenarios"
	@echo "  make backend-install         Create backend venv and install requirements"
	@echo "  make backend-run             Run backend API on :8000"
	@echo "  make frontend-install        Install frontend dependencies"
	@echo "  make frontend-run            Run Next.js dashboard on :3000"

preflight:
	@CLUSTER_NAME=$(CLUSTER_NAME) KUBE_CONTEXT=$(KUBE_CONTEXT) ./scripts/preflight-check.sh

cluster-up:
	@CLUSTER_NAME=$(CLUSTER_NAME) KUBE_CONTEXT=$(KUBE_CONTEXT) KIND_CONFIG=$(KIND_CONFIG) ./scripts/create-cluster.sh

cluster-down:
	@CLUSTER_NAME=$(CLUSTER_NAME) ./scripts/destroy-cluster.sh

cluster-reset: cluster-down cluster-up

metrics-server install-metrics:
	@CLUSTER_NAME=$(CLUSTER_NAME) KUBE_CONTEXT=$(KUBE_CONTEXT) ./scripts/install-metrics-server.sh

verify-structure:
	@test -d frontend
	@test -d backend
	@test -d demo-app
	@test -d k8s
	@test -d scripts
	@test -d docs
	@echo "Repository structure check passed."

demo-image:
	@docker build -t demo-app:$(VERSION) ./demo-app

demo-load:
	@kind load docker-image demo-app:$(VERSION) --name $(CLUSTER_NAME)

demo-deploy:
	@kubectl --context $(KUBE_CONTEXT) apply -k k8s/demo-app

demo-wait:
	@kubectl --context $(KUBE_CONTEXT) -n $(NAMESPACE) rollout status deployment/demo-app --timeout=180s

demo-rollout:
	@kubectl --context $(KUBE_CONTEXT) -n $(NAMESPACE) set image deployment/demo-app demo-app=demo-app:$(NEW_VERSION)
	@kubectl --context $(KUBE_CONTEXT) -n $(NAMESPACE) patch configmap demo-app-config --type merge -p '{"data":{"APP_VERSION":"$(NEW_VERSION)"}}'
	@kubectl --context $(KUBE_CONTEXT) -n $(NAMESPACE) rollout status deployment/demo-app

demo-status:
	@kubectl --context $(KUBE_CONTEXT) -n $(NAMESPACE) get deploy,po,svc,cm

demo-up: demo-image demo-load demo-deploy demo-wait demo-status

demo-all:
	@CLUSTER_NAME=$(CLUSTER_NAME) KUBE_CONTEXT=$(KUBE_CONTEXT) NAMESPACE=$(NAMESPACE) VERSION=$(VERSION) PRELOAD_ROLLOUT_VERSIONS=$(PRELOAD_ROLLOUT_VERSIONS) ./scripts/demo-all.sh

demo-all-down:
	@CLUSTER_NAME=$(CLUSTER_NAME) STOP_COLIMA=$(STOP_COLIMA) COLIMA_PROFILE=$(COLIMA_PROFILE) ./scripts/demo-all-down.sh

demo-stop:
	@./scripts/demo-stop.sh

golden-reset:
	@CLUSTER_NAME=$(CLUSTER_NAME) KUBE_CONTEXT=$(KUBE_CONTEXT) NAMESPACE=$(NAMESPACE) VERSION=$(VERSION) ./scripts/golden-reset.sh

rehearsal-check:
	@KUBE_CONTEXT=$(KUBE_CONTEXT) NAMESPACE=$(NAMESPACE) ./scripts/rehearsal-check.sh

backend-install:
	@cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

backend-run:
	@cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

frontend-install:
	@cd frontend && npm install

frontend-run:
	@cd frontend && npm run dev
