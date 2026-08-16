# Sources of truth

This document prevents project workflow, repository documentation, executable behavior, and historical notes from silently overriding one another.

## Authority by subject

| Subject | Authoritative source | Notes |
| --- | --- | --- |
| Requested scope and permitted actions | The user's current explicit instruction | Editing does not imply GitHub publication authority. |
| Assistant workflow, visual gates, approval gates, minimum QA | Moguria project workflow and integrated rules | These govern how work is performed, not the current code architecture. |
| Repository, runtime, deployment, versions, budgets, validation and manifest paths | `config/project-state.json` | Verify it against provider settings and executable files before risky work. |
| Asset inventory | `config/asset-manifest.json` | `assets/manifest.json` is the current runtime projection. |
| Animation state/data contract | `config/animation-manifest.json` | `assets/images/battle-v3/atlas.json` is the Battle projection at version 2; `assets/animations/story-ch01.json` is the independent Story projection at version 1. |
| Game behavior | Code and automated tests | A documentation conflict is a defect to report, not a reason to guess. |
| Pages source, branch protection, build status | GitHub repository settings | These settings determine whether a push publishes. |
| Past changes | `CHANGELOG.md`, tags and release notes | Historical and non-normative. |

## Project workflow rules reference

The repository documents were prepared against the following canonical Moguria workflow rules:

- rules ID: `moguria-development-rules`
- version: `3.0.0`
- effective date: `2026-08-14`
- SHA-256: `9950741898d91396543bc6f76653e1ec39d42c9a9f6418e39d8f04232288d817`

The hash identifies the workflow copy used for approval gates, visual gates, and minimum QA. It does not replace repository technical truth. When the canonical rules change, review the affected repository documents and update this reference only after confirming the new ID/version/hash.

## `project-state` and manifests

`config/project-state.json` does not duplicate each asset or frame. It identifies the canonical manifests, runtime projections, validation commands, versions, and budgets that apply to them.

```text
config/project-state.json
  ├─ validation.assetSource ───────> config/asset-manifest.json
  │  └─ validation.assetRuntimeOutput / generated.assetManifest
  │                                  └─ assets/manifest.json
  └─ validation.animationSource ──> config/animation-manifest.json
     ├─ validation.animationRuntimeOutput / generated.animationManifest
     │                                └─ assets/images/battle-v3/atlas.json (Battle v2)
     └─ validation.storyAnimationRuntimeOutput / generated.storyAnimationManifest
                                      └─ assets/animations/story-ch01.json (Story v1)
```

“Runtime projection” describes a compatibility file consumed by current code. Generation is not installed in the current baseline: update the canonical file and every affected projection together, then run the validator named by project-state. A Story-only change does not require changing the Battle projection when its projected contract is unchanged. Do not hand-edit one file and assume the others follow automatically.

Version rules:

- `project-state.versions.application` is the canonical application version.
- `project-state.versions.display` is the human-facing release label derived from the application version policy.
- `project-state.versions.saveSchema` must match the payload version normalized by `MoguriaSave`.
- `project-state.versions.assetManifest` must match the canonical asset manifest schema/version policy.
- `project-state.versions.animationManifest` must match the Battle runtime projection version.
- `project-state.versions.storyAnimationManifest` must match the Story runtime projection version.
- Human-facing version text and the changelog must be checked against these values before publication.

Budget rules:

- Numeric performance limits live under `project-state.performanceBudgets`.
- Asset documentation explains the limits but does not introduce a competing number.
- Validation must measure the repository and fail when a required budget is exceeded.

## Conflict handling

1. Confirm the exact branch and commit being inspected.
2. Compare the relevant project-state value, canonical manifest, runtime projection, code/test behavior, and GitHub setting.
3. For a read-only request, report the conflict with evidence.
4. For an implementation request, resolve low-risk documentation drift within scope. Stop before a risky behavioral, save, deployment, or destructive decision that the request did not authorize.
5. Update the source that owns the fact; do not patch every document with another copy of the same value.
