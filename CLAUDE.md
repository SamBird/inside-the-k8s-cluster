# AGENTS.md

## Mission

Build and maintain a **local-first interactive teaching demo** for the talk:

**Inside the Kubernetes Cluster: What Really Happens After You Apply YAML**

The outcome must be a **reliable, easy-to-run, projector-friendly demo** that helps an audience understand the internal flow of Kubernetes after applying manifests.

This repository is for a **teaching product**, not a production platform.

---

## Core objective

Optimise for these outcomes in order:

1. **Live demo reliability**
2. **Clarity of the educational story**
3. **Fast, simple local setup**
4. **Visual clarity in the UI**
5. **Ease of extension later**

When trade-offs appear, always prefer the option that makes the demo:

- easier to run locally
- easier to explain live
- less likely to fail during a talk

---

## Required stack

Use this stack unless explicitly told otherwise:

- **Frontend:** Next.js + TypeScript
- **Backend:** Python + FastAPI
- **Kubernetes client:** official Python Kubernetes client
- **Local cluster:** kind or colima
- **Containerisation:** Docker
- **Automation:** Makefile + shell scripts

Do not replace the stack without a strong reason and explicit explanation.

---

## Required demo behaviours

The demo must support these user-visible flows:

1. **Empty cluster view**
2. **Deploy app**
3. **Scale from 1 to 3 replicas**
4. **Generate traffic**
5. **Delete a pod and show self-healing / replacement**
6. **Break readiness and restore it**
7. **Roll out a new version**
8. **Reset the demo back to a known baseline**

These flows are core scope. Prioritise them before optional enhancements.

---

## What good looks like

A good solution is:

- understandable by someone learning Kubernetes
- robust enough for repeated local demos
- fast to start and reset
- visually clear when projected on a large screen
- simple to reason about in code
- explicit about trade-offs and limitations

---

## Working style

When making changes:

- first understand the existing structure before editing
- prefer incremental progress over large speculative rewrites
- preserve working behaviour unless replacing it with something demonstrably better
- keep implementation practical and grounded
- avoid over-abstraction
- avoid gold-plating
- finish one meaningful slice of functionality before starting the next

Before major changes, briefly state:

- what you are changing
- why
- the expected user-visible outcome

---

## Implementation rules

Follow these rules unless explicitly overridden:

- prefer **working code over scaffolding**
- prefer **simple architecture over abstraction**
- prefer **deterministic behaviour over cleverness**
- keep the UI **projector-friendly**
- keep dependencies **minimal, explicit, and justified**
- keep local setup **short and repeatable**
- design for **demo resilience**, not production completeness

### Avoid adding

Do **not** add the following unless explicitly requested:

- authentication
- cloud-managed dependencies
- service mesh
- persistent volumes
- StatefulSets
- operators
- Helm unless there is a strong demo-specific reason
- unnecessary background infrastructure
- heavy observability stacks unless essential to the teaching story

### UI guidance

The UI should be:

- readable from a distance
- high contrast
- low clutter
- clear about current cluster state
- explicit about what changed after each action
- supportive of narration during a live talk

Avoid dense dashboards, tiny text, and unnecessary animation.

---

## Educational guidance

This is not just a control panel. It must help explain Kubernetes internals.

Prefer features that make concepts easier to teach, such as:

- desired vs actual state
- reconciliation behaviour
- scheduling and pod replacement
- readiness vs liveness meaning
- service routing and traffic distribution
- rollout behaviour
- separation between declarative config and controller action

When possible, make the causal story visible:

**user action -> Kubernetes reaction -> observable cluster outcome**

---

## Scope control

Stay focused on the stated demo goals.

Do not drift into building:

- a general Kubernetes platform
- a production-grade dashboard
- a multi-tenant system
- a generic deployment framework
- enterprise-grade security or policy features

If an idea is interesting but out of scope, note it separately rather than implementing it.

---

## Code quality expectations

Write code that is:

- clear and readable
- consistent with existing repo conventions
- small in surface area where possible
- easy for another engineer to explain live
- explicit in behaviour
- reasonably modular without abstraction for abstraction’s sake

Prefer:

- descriptive names
- small focused functions
- obvious control flow
- comments where intent may not be obvious
- simple APIs between frontend, backend, and demo control logic

Avoid:

- speculative interfaces
- unnecessary indirection
- dead code
- placeholder implementations presented as complete
- hidden magic

---

## Validation rules

Whenever you change code, validate what is practical and relevant.

Expected validation includes, where available:

- run relevant tests
- run type checks
- run linting
- verify Dockerfiles build if practical
- verify manifests for obvious errors
- perform targeted smoke checks for changed behaviour
- confirm that the main demo flows still make sense

In every substantial update, clearly state:

- what you validated
- what you did not validate
- any known risks or assumptions

Do not claim something works unless you have validated it or are explicitly making a reasoned assumption.

---

## Repo hygiene

Keep the repository tidy.

- update docs when behaviour or setup changes
- remove obsolete code when replacing it
- keep scripts discoverable and named clearly
- ensure commands in docs match reality
- avoid leaving incomplete scaffolding behind
- keep configuration explicit rather than hidden across many files

If a change affects setup, demo usage, or troubleshooting, update the relevant documentation in the same piece of work.

---

## Git workflow policy

Use disciplined, human-readable commits.

### Commit principles

- create commits at coherent checkpoints
- prefer logically grouped changes
- prefer multiple clean commits over one large mixed commit
- do not commit broken or half-finished work
- do not mix unrelated changes in one commit

### Good checkpoint examples

- completed milestone
- meaningful feature slice
- coherent bug fix
- validation-driven refactor
- documentation update paired with the related code change

### Before committing

- check `git status`
- review changed files for accidental edits
- run relevant validation where practical
- ensure the commit message reflects the actual change

### Commit message guidance

Use clear, human-readable commit messages.

Conventional style is preferred when it fits, for example:

- `feat: add rollout visualisation controls`
- `fix: restore pod replacement after delete action`
- `docs: update local demo walkthrough`

If a commit cannot be created because of sandbox, permissions, or approval limits, state that clearly and continue with uncommitted changes.

---

## Deliverables

The repository should ultimately contain:

- working code
- scripts
- Kubernetes manifests
- clear documentation
- demo walkthrough
- speaker notes
- troubleshooting guide

Where possible, deliver these in a way that helps someone else run the demo without verbal explanation.

---

## Documentation expectations

The docs should make it easy for another engineer to:

- understand the purpose of the project
- set it up locally
- run the demo
- reset the demo
- explain the story during a talk
- recover from common failures

Important documentation areas:

- `README`
- setup instructions
- run instructions
- reset flow
- walkthrough for the demo narrative
- troubleshooting notes
- any meaningful trade-offs or constraints

---

## How to respond when making changes

For any non-trivial task, structure your work like this:

1. **Understand**
   - inspect existing code and repo structure
   - identify the minimum viable change

2. **Plan**
   - describe the intended change briefly
   - note dependencies, risks, and assumptions

3. **Implement**
   - make the smallest effective set of changes
   - keep scope tight

4. **Validate**
   - run the most relevant checks available
   - do a targeted sanity check for the affected flow

5. **Report**
   - summarise what changed
   - summarise validation performed
   - call out anything unverified or deferred

---

## Execution expectations for coding agents

When implementing a task:

- inspect relevant files before editing
- avoid guessing when the codebase already shows a pattern
- preserve existing conventions unless there is a clear reason to improve them
- prefer editing existing files over creating unnecessary new ones
- keep diffs focused and reviewable
- surface blockers early
- explicitly state assumptions
- do not invent validation results
- do not mark TODO scaffolding as complete functionality

---

## Reasoning expectations

Before coding, identify:

- the user-visible behaviour being changed
- the simplest implementation path
- likely failure points in the live demo
- what must be validated to have confidence

Do not over-engineer. Think carefully, then implement directly.

---

## Decision rules when uncertain

When in doubt, choose the option that is:

- easier to run live
- easier to explain to an audience
- easier to reset
- easier to debug locally
- less surprising for another engineer reading the repo

If two solutions are technically valid, prefer the one with:

- fewer moving parts
- clearer teaching value
- lower demo risk

---

## Non-goals

Unless explicitly requested, this repo is **not** trying to be:

- production-ready infrastructure
- highly secure enterprise software
- a generic Kubernetes management platform
- a reusable framework for all demos
- a polished SaaS-style product

It is a focused, robust, educational local demo.

---

## Final instruction

Always optimise for a demo that is:

**easy to run, easy to explain, and hard to break.**