# Security Policy

## Supported version

Security fixes target the latest code on `main` and the latest published release.

## Report privately

Do not publish exposed credentials, private URLs, transcripts, notes, or vulnerability details in a public issue. Use GitHub private vulnerability reporting when it is available. Otherwise contact the repository owner through their GitHub profile and request a private channel without including sensitive details in the public message.

Include the affected commit or version, minimal reproduction steps, expected and observed behavior, impact, and a proposed fix when possible. Replace real credentials and private content with redacted test values.

## High-priority issues

- credentials or private content entering source, logs, screenshots, commits, or release ZIPs;
- requests to origins outside the documented provider and local-companion hosts;
- script or HTML injection through webpage content, transcripts, metadata, provider errors, or model output;
- article content being transmitted without an explicit translate or save action;
- unintended browsing-history collection or access outside the active page;
- unintended writes outside the configured Markdown file or Notion page; and
- bypasses of local deletion or provider configuration controls.

## User guidance

- Install only from a source or release you trust.
- Enter API keys only in the extension Settings page or local companion setup page.
- Keep `.env.local` out of Git and screenshots.
- Use dedicated keys with spending limits where providers support them.
- Review packaged files before loading an update.
- Keep the companion bound to loopback; its origin checks are part of the security boundary.
- Remember that Chrome local storage and `.env.local` are not encrypted credential vaults.

The release tooling uses an explicit allowlist and scans public files for common credential patterns, but automated checks cannot detect every secret.
