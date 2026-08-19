# AI Agent Working Agreement — Zalo IT HelpDesk

This file is the operating agreement for any AI agent continuing this project. It records the project owner's collaboration style, the autonomy boundary, and the technical release discipline expected in this repository.

## 1. Project owner and communication style

- Communicate with the project owner in Vietnamese unless they ask for another language.
- Lead with the outcome, then provide concise evidence and the next action.
- Be proactive. Diagnose, implement, verify, and publish within the authorized scope instead of asking for routine confirmations.
- Give short progress updates during long work so the owner can follow what is happening.
- Explain concrete risks and trade-offs. Avoid vague assurances.
- After every GitHub update, always include exact Windows PowerShell commands for updating the owner's local checkout, the expected latest commit, the expected application version, and whether a database migration or Mini App deployment is required.
- The owner's normal local environment is Windows PowerShell, Node.js, SQL Server at `localhost:1433`, backend at `http://127.0.0.1:8080`, and Admin at `http://localhost:8080/admin`.

## 2. Autonomy and approval boundary

### Non-UI/UX changes

For fixes, backend behavior, tests, observability, documentation, refactors, security hardening, and other changes that do not materially alter UI/UX:

1. Work autonomously from Workspace through verification and GitHub.
2. Create or update the branch and PR, complete the relevant checks, and merge when safe.
3. Do not ask the owner for a redundant approval before publishing or merging.
4. Report what changed and provide local update commands.

### UI/UX changes

For new layouts, visual language, navigation, interaction patterns, information hierarchy, or other material UI/UX decisions:

1. Implement and verify on a review branch.
2. Publish a draft PR for visual review.
3. Stop before merge until the owner explicitly approves the UI/UX.
4. Specific feedback on a reviewed component authorizes that requested adjustment on the draft branch, but does not authorize merging the whole PR.
5. Once the owner explicitly approves the UI, mark the PR ready and merge after final validation.

Do not deploy to an external environment, publish the Zalo Mini App, rotate credentials, delete data, or run destructive database operations unless the owner explicitly requests that action.

## 3. GitHub workflow

- Prefer the connected GitHub app for remote operations. Do not require or install `gh` for this project.
- Use local Git for status, diff review, staging, commits, and verification. Preserve unrelated owner changes.
- Inspect `git status -sb`, the full intended diff, the current branch, and the remote base before publishing.
- Keep every PR focused. Never silently include unrelated files, `.env` files, credentials, generated secrets, backups, or local data.
- Default UI/UX work to a draft PR. Non-UI work may proceed through ready and merge under the autonomy rule above.
- Before merge, verify the PR is mergeable, its head SHA has not moved, required checks are not failing, and there are no unresolved actionable review threads.
- Use the expected head SHA when merging so a moved PR cannot be merged accidentally.
- After merge, verify `main`, the merge commit, application version, health metadata, schema state, and PR status.
- Do not deploy the Mini App merely because its source was merged. State clearly whether deployment is still required.

## 4. Required quality gates

Choose gates by impact, but never skip a relevant gate merely because a change looks small.

Baseline for backend or cross-system changes:

```powershell
cd .\backend
npm ci
npm run check
npm test
```

Also run the following when relevant:

- `npm run playbook:benchmark` for Playbook, search, retrieval, ranking, Copilot grounding, or knowledge changes.
- Runtime smoke tests for API, authentication, ticket lifecycle, provider routing, health metadata, or storage changes.
- `npm run db:status` when database compatibility is in question.
- Production Mini App build for any Mini App, shared contract, or cross-system release change:

```powershell
cd .\miniapp
npm ci
npm run build
```

Every release must also include:

- a credential/secret scan of the intended diff;
- an explicit statement of the database schema version and migration requirement;
- an explicit statement of whether Mini App deployment is required;
- regression coverage for a bug fix or behavior change;
- release documentation describing outcome, impact, validation, and rollback considerations.

If a gate cannot run, state exactly why and do not claim it passed.

## 5. Versioning and release consistency

- Keep backend and Mini App version metadata aligned for a system release unless the release is intentionally component-only.
- Update all user-visible cache-busting/version references and health metadata together.
- Add meaningful health feature flags for major capabilities so the deployed runtime can be verified without inference.
- Keep release notes under `docs/releases/<version>/`.
- Never add a database migration for a UI-only release.
- Current system release: `v5.15.0`; UI/UX remains the approved v5.14.1 design.
- SQL Server/NAS schema remains `9`; free-hosting PostgreSQL uses state schema `1`.
- Changing the hosted backend URL requires a Mini App rebuild/deploy even when UI code is unchanged.

## 6. Product and UI principles

The shared design direction is **Warm Industrial + Signal System**.

- Use warm ivory/sand surfaces, graphite structure, restrained Signal Blue, and purposeful green/amber/orange/red status colors.
- Avoid generic safe SaaS styling, excessive rounded cards, decorative gradients, and large black selected-state blocks.
- Selected filters use a light Signal Blue surface, blue border/text, and a blue signal line—not a black fill.
- Every operational ticket surface should make four answers obvious: current status, owner, next step, and who must act.
- Admin Ticket Workspace uses three zones: queue, conversation, and context/dispatch.
- Keep system notices minimal and do not add unnecessary icons.
- Preserve responsive, loading, empty, error, and offline states.
- Admin is for IT operations; the Mini App is the employee/client interface. A review of one does not automatically validate the other.
- Employee-facing UI must not expose AI provider, model, confidence, internal routing, or sensitive diagnostic details.
- Preserve business behavior and API contracts during visual redesign unless a behavior change is explicitly in scope.

## 7. AI routing and observability invariants

- Cloud route order is `gemini -> groq -> openrouter -> sambanova`.
- Do not reintroduce a local Ollama dependency unless explicitly requested.
- Missing provider quota headers mean **unknown**, never zero.
- Only show a remaining quota value when the provider supplies a reliable source for it.
- Preserve failover, circuit-breaker behavior, redaction, employee-safe responses, and Staff Copilot independence.
- Do not expose API keys or reproduce secrets in logs, documentation, screenshots, PR bodies, or chat. If a key is visibly leaked, advise immediate revocation and rotation.

## 8. Database and data safety

- Treat migrations, imports, restores, backups, and destructive data changes as high-risk operations.
- Inspect schema state before deciding a migration is required.
- Never run `npm run db:migrate` for a release with no migration.
- Never overwrite or delete owner data to make a test pass.
- Preserve compatibility with SQL Server and the configured JSON fallback where the codebase still supports it.
- Keep backups, exported data, `.env` files, API keys, and local runtime artifacts out of Git.

## 9. Local handoff format

After a normal merged release with no migration, give the owner a PowerShell handoff similar to:

```powershell
cd <repository-root>
git switch main
git status --short
git pull --ff-only origin main
git log -1 --oneline

cd .\backend
npm ci
npm start
```

Then state:

- the exact expected commit line;
- the `/health` version and important features to verify;
- whether Admin needs `Ctrl+F5`;
- whether Mini App dependencies/build/deployment are needed;
- explicitly: `Không chạy npm run db:migrate` when there is no migration;
- explicitly: do not run `git stash pop` unless the owner intentionally created and wants to restore a stash.

## 10. Definition of done

Work is done only when the requested behavior is implemented, relevant checks pass, secrets and unrelated changes are excluded, documentation is current, GitHub state matches the approved autonomy boundary, and the owner has actionable local update instructions.
