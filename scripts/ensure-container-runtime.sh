#!/usr/bin/env bash
set -euo pipefail

AUTO_START_COLIMA="${AUTO_START_COLIMA:-1}"
COLIMA_PROFILE="${COLIMA_PROFILE:-default}"

info() {
  printf '[info] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1" >&2
}

fail() {
  printf '[fail] %s\n' "$1" >&2
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  fail "docker command is not installed."
fi

if docker info >/dev/null 2>&1; then
  exit 0
fi

if [[ "$AUTO_START_COLIMA" != "1" ]]; then
  fail "Docker daemon is not reachable. Start Docker/Colima and retry."
fi

if ! command -v colima >/dev/null 2>&1; then
  fail "Docker daemon is not reachable and colima is not installed."
fi

info "Docker daemon is not reachable. Attempting to start Colima profile '${COLIMA_PROFILE}'."
if ! colima start --profile "$COLIMA_PROFILE"; then
  fail "Failed to start Colima profile '${COLIMA_PROFILE}'."
fi

for _ in {1..30}; do
  if docker info >/dev/null 2>&1; then
    info "Container runtime is ready via Colima profile '${COLIMA_PROFILE}'."
    exit 0
  fi
  sleep 1
done

warn "Tried starting Colima profile '${COLIMA_PROFILE}', but docker is still unreachable."
fail "Container runtime unavailable. Check Colima/Docker status and retry."
