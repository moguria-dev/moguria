# Security policy

Moguria is currently a public, static, client-only browser game. This policy describes its trust boundary and how to report a potential vulnerability without disclosing secrets or user data.

## Supported version

Security fixes target the version currently published from the release source declared in `config/project-state.json`. Historical branches, ZIPs, and old release notes are not supported security baselines.

## Trust boundary

- Game code and production assets are delivered to the browser and are visible and modifiable by the player.
- Progress is stored in localStorage. Client-side signatures, validation, and obfuscation can detect some corruption but cannot provide trustworthy anti-cheat.
- Development tools are allowed only on configured local hosts with the explicit `#dev` or `?dev=1` flag. The public origin must not expose the development menu even when the flag is present.
- Debug UI, console output, error logs, exported saves, screenshots, and issue attachments must not contain secrets, credentials, tokens, cookies, private keys, personal information, or complete user data.
- The repository must contain no production credentials. A future network service must use server-side secret storage and must never embed a privileged key in HTML or JavaScript.
- If competitive rankings, shared rewards, payments, or trusted achievements are introduced, results and authorization must be validated by a server. Client-submitted values cannot be accepted as truth.

## Reporting a vulnerability

Do not disclose an exploitable vulnerability, secret, credential, private save, or personal information in a public GitHub issue, pull request, commit, screenshot, or chat transcript.

If GitHub **Private vulnerability reporting** is enabled for `moguria-dev/moguria`, use the repository's **Security → Report a vulnerability** flow. Include the affected URL/version, impact, minimal reproduction, and a remediation idea when available.

If private vulnerability reporting is not available, do not invent or guess a contact address. Ask the repository owner to enable or identify a private reporting channel, and withhold sensitive reproduction details until that channel exists. A public issue may state only that a private security contact is needed; it must not contain exploit details.

For a suspected leaked secret:

1. do not repeat or commit the value;
2. preserve only non-sensitive evidence such as the path and commit;
3. notify the owner through an available private channel;
4. rotate/revoke the secret at its provider;
5. remove exposure through an approved history-remediation plan when necessary.

Deleting a file in a later commit does not revoke a secret already exposed in history.

## Release security checks

Before an authorized publication:

- public URL with `#dev` and `?dev=1` still hides development controls;
- no credentials, secrets, private endpoints, personal data, full save exports, QA logs, test fixtures, or debug-only UI are introduced;
- dynamic values rendered into the DOM use safe text handling or appropriate escaping;
- imported/untrusted JSON is validated and failures do not crash startup;
- new network requests use HTTPS, constrain destinations and paths, define timeout/fallback, and do not become required during active play without an explicit architecture decision;
- dependency and vendored-license changes are reviewed;
- canonical/runtime manifests contain only approved first-party relative paths;
- Service Worker remains off unless its security/update review and deployment gate are complete;
- affected automated tests and public post-deployment console/404 checks pass.

Security changes follow the same authorization boundary as other work. A report or fix request does not itself authorize commit, push, merge, disclosure, or publication.

