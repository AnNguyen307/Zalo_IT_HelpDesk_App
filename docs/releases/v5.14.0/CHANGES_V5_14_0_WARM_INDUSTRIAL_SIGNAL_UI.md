# v5.14.0 — Warm Industrial + Signal System UI

## Outcome

The complete existing Admin/Technician and Zalo Mini App surfaces now share one operational design language: warm ivory/sand surfaces, graphite structure, restrained Signal Blue actions and explicit state/ownership/next-step signals.

## Admin / Technician

- Reorganized navigation into Operations, Knowledge and Administration.
- Replaced the blue SaaS visual layer with the Warm Industrial token system.
- Flattened KPI cards into a compact service metric strip.
- Replaced the black active quick-filter state with a softer Signal Blue selection treatment.
- Added action owner and next action to queue rows.
- Rebuilt Ticket Workspace as three zones: queue, conversation and context/dispatch.
- Added a four-part signal strip for status, assignee, next step and action owner.
- Applied the same component language to Reports, Staff, Knowledge, Playbook Governance and System/AI Health.

## Zalo Mini App

- Changed bottom navigation to Trang chủ / Yêu cầu / Thông báo / Cá nhân.
- Added common-issue shortcuts that prefill the request form.
- Added owner, next step, action-required signal and progress tracker to ticket cards.
- Added a complete signal board and stage tracker to Ticket Detail.
- Improved human handoff copy with explicit owner and SLA expectation.
- Removed provider, model and confidence data from employee UI.
- Added explicit loading and offline states.

## Engineering

- No API contract or database migration change.
- Database schema remains version `9`.
- Mini App now has a standard `dev` script and a local `/api` proxy for preview QA.
- Health features include `warm-industrial-ui`, `signal-system`, `ticket-workspace-three-zone` and `employee-ai-detail-isolation`.
- Added regression tests for design tokens, three-zone workspace, navigation and AI detail isolation.

## Verification

- Backend syntax: passed.
- Backend tests: 89/89 passed.
- Playbook benchmark: Hit@5 100%, MRR 0.95.
- Mini App production build: passed.
- Runtime smoke: version, health features, employee authentication, ticket creation and Staff read passed.
- Visual/browser review: pending because the isolated preview surface was unavailable in the current environment.

## Release state

UI/UX approved after Admin and Client review. Approved for merge to `main`.
