# AGENTS.md

## Project purpose
This repository contains a local-first teaching demo for a talk:
"Inside the Kubernetes Cluster: What Really Happens After You Apply YAML"

The product is an interactive visual demo that explains how Kubernetes works internally.

## Priorities
1. Reliability of the live demo
2. Clarity of the educational story
3. Simplicity of setup
4. Visual quality
5. Extensibility

## Required stack
- Frontend: Next.js + TypeScript
- Backend: Python FastAPI
- Kubernetes client: official Python Kubernetes client
- Cluster: kind or colima
- Containerisation: Docker
- Automation: Makefile + shell scripts

## Required behaviour
The project must support:
- empty cluster view
- deploy app
- scale from 1 to 3
- generate traffic
- delete a pod and show replacement
- break readiness and restore it
- rollout new version
- reset the demo

## Implementation rules
- Prefer working code over scaffolding
- Prefer simple architecture over abstraction
- Keep the UI projector-friendly
- Do not add auth or cloud dependencies
- Do not add service mesh, PVs, StatefulSets, or operators
- Keep dependencies minimal and explicit
- Explain trade-offs in README when needed

## Validation rules
Whenever you change code:
- run relevant tests if present
- run type checks if configured
- run lint if configured
- verify Dockerfiles build if practical
- verify manifests for obvious errors
- document anything not validated

## Deliverables
- working code
- scripts
- manifests
- docs
- demo walkthrough
- speaker notes
- troubleshooting guide

## When in doubt
Choose the option that makes the live demo easier to run and easier to explain.