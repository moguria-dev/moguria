# Agent development environment

This document separates durable repository expectations from one audit session's tool availability. It does not grant any GitHub, deployment, connector, or filesystem action.

Official OpenAI references:

- [Permissions](https://learn.chatgpt.com/docs/permissions)
- [AGENTS.md configuration](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Skills and plugins](https://learn.chatgpt.com/docs/skills-and-plugins)

## Durable model

### `AGENTS.md`

Codex automatically discovers applicable `AGENTS.md` files. The repository-root file supplies the default instructions for this project; a more deeply nested file may add or override instructions only within its directory scope.

`AGENTS.md` should contain stable repository rules: sources of truth, safety boundaries, architectural invariants, and verification routing. It should not contain ephemeral session paths, temporary tokens, or a claim that an external permission is currently enabled.

### Moguria Development Skill

The Moguria Skill supplies project workflow: task classification, visual quality gates, approval gates, minimum QA, and GitHub publication boundaries. Repository documents supply the current technical architecture, schema, commands, manifests, and provider state.

The canonical workflow rules reference is recorded in `docs/SOURCE_OF_TRUTH.md`. A Skill can guide an action but cannot override the user's current scope or grant connector/GitHub authority.

### Recommended sandbox and network posture

Use the least privilege that permits the task:

- filesystem: `workspace-write` for implementation; read-only is sufficient for audits;
- no `danger-full-access` requirement for routine Moguria work;
- network: disabled when unnecessary, otherwise restricted to the minimum domain allowlist needed for GitHub, package retrieval, preview, or public-site verification;
- secrets: deny `.env`, credential stores, SSH keys, tokens, cookies, browser profiles, and unrelated personal paths unless a narrowly scoped task explicitly and safely requires a supported connector;
- commands: keep destructive and privilege-escalating operations outside normal workflow;
- outputs: never copy secrets from the environment into logs, issues, commits, artifacts, or chat.

Expanding the sandbox or network is a risk decision, not a workaround for a failed command. Stop and request direction when the task materially requires broader authority.

### Connectors are separate authority

GitHub and other connectors manage authentication and provider permissions independently of local filesystem access. A writable checkout does not imply connector access; connector admin permission does not imply authorization to use it.

Stage, commit, push, PR creation, review action, merge, deployment, release, and rollback are separate operations. Authority is granted per user request and task unit. Never infer a later action from permission for an earlier one.

Provider settings may require repository-owner/admin action outside the connector. When an endpoint is unavailable or forbidden, report the exact unverified setting and give a UI/API verification procedure; do not claim the setting was changed.

### Skills, connectors and optional plugins

Required for the established ChatGPT-assisted Moguria workflow:

- **Moguria Development Skill** for project-specific workflow and quality/approval gates;
- **GitHub connector** for current branch/files/settings inspection and only the explicitly authorized repository actions.

The **Library** is used when a durable, user-facing master artifact or source document must be preserved outside the repository workflow. It is not a substitute for version-controlled repository docs, code, manifests, or releases.

Additional plugins are capability-on-demand, not baseline dependencies. Install or use Figma, Notion, Vercel, Sentry, PostHog, or similar services only when a concrete requirement needs that provider and the user authorizes the corresponding external data/action boundary.

**Codex Security** is a possible later periodic-audit aid after CI, branch protection, manifests, dependency policy, and basic repository governance are established. Do not make it a prerequisite for ordinary development or use it as a substitute for those controls.

## Task profiles

| Task | Filesystem | Network/connector | Write authority |
| --- | --- | --- | --- |
| Documentation/code audit | read-only | read-only GitHub access when needed | none |
| Local implementation | workspace-write | normally none or read-only retrieval | local files only |
| Dependency change | workspace-write | allowlisted package registry | local files; dependency expansion may require prior decision |
| GitHub reflection | workspace-write | authorized GitHub connector/git remote | only the explicitly authorized stage/commit/push/PR action |
| Publication | workspace-write | GitHub Pages/workflow access | explicit merge/deploy/publication authority plus release gate |
| GitHub settings | none locally | repository admin UI/API | explicit settings authority; independently verify final state |

## Session preflight

At the start of work, determine without exposing secrets:

1. applicable `AGENTS.md` and Skill/rules version;
2. repository, branch, current head and worktree ownership;
3. filesystem sandbox and writable roots;
4. network state and allowed domains;
5. available read/write connector actions;
6. the exact user-authorized stopping point;
7. whether the current release source makes a requested push also publish.

Record mutable provider/tool observations in `docs/CURRENT_STATE.md` only when they are useful to future maintenance, with an audit date/commit. Do not turn them into timeless policy.

## Audited environment note

The 2026-08-14 audit could read repository metadata, branch state, files and GitHub Pages source. Administrative Pages/protection endpoints were unavailable/forbidden through the connected GitHub tooling, so provider settings changes require an authorized repository administrator and independent verification. This observation is restated in `docs/CURRENT_STATE.md`; it is not a promise about future connector capabilities.
