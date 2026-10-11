# Security policy

## Supported versions

The `main` branch is the currently supported development version. There is no
published store release yet.

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability. Use GitHub's
private **Report a vulnerability** button in the repository's Security tab.
If that option is unavailable, contact the repository owner privately through
GitHub and include reproduction steps, affected browser/version, and impact.

Chronly has no server or account system. Reports about data leaving the
extension, unsafe permissions, executable imported content, or notification or
audio privilege escalation are high priority.

## Known advisories in development tools

The released extension's only runtime dependency is Svelte. `npm audit` checks
the whole development toolchain as well, and one advisory there has no fix yet:

- `node-forge` (GHSA-86w9-cpqp-85rv), reached through `web-ext` →
  `@devicefarmer/adbkit`, which `web-ext` uses only to run extensions on
  Android devices. Chronly's scripts never do that, and no patched
  `node-forge` release exists. Remove this note once one does.

`package.json` overrides `shell-quote` to a patched version because `web-ext`'s
`fx-runner` pins a vulnerable one.
