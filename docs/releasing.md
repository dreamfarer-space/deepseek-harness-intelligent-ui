# Release integrity and npm authentication

Release changes through a reviewed PR first. Keep the current package version
while preparing fixes; after merge, add the new changelog section and use
`npm version patch` (or the intended release version) to rebuild, commit and tag.
Never move an existing release tag or overwrite a published npm version.

The release workflow checks that the tagged commit is reachable from `main`,
runs the CI matrix, publishes if the version is absent, then verifies registry
integrity, every packed file, `gitHead`, provenance repository/ref/commit and
cryptographic signatures. A registry/network/authentication error is not treated
as "version absent". A retry only reuses identical contents from the same source.
The GitHub Release receives the verified npm tarball; an existing different
attachment fails instead of being overwritten.

The supported DSH prerelease peer ranges include the tested 0.2.0-rc and
0.2.1-alpha lines explicitly so ordinary npm co-installation and DSH's own
compatibility gate agree on those versions. CI checks both semver behaviors.

## npm Trusted Publishing

Releases publish only through npm Trusted Publishing (OIDC); no npm token is
stored in GitHub. 0.2.2 was the first OIDC release, after which the old
granular token was revoked and the `NPM_TOKEN` secret removed.

The npm package's Settings → Trusted Publisher must keep matching exactly:

- provider: GitHub Actions
- owner: `dreamfarer-space`
- repository: `deepseek-harness-intelligent-ui`
- workflow filename: `release.yml`
- environment: `npm`

The publish job needs `id-token: write`, Node 24 and pinned npm 11.9.0 (OIDC
needs Node ≥22.14 / npm ≥11.5.1). npm logs a rejected token exchange only at
verbose level and then fails with a bare `ENEEDAUTH`, so the job publishes
verbosely and prints the debug log's OIDC lines on failure. A mismatch above is
the usual cause; fix it on npm and rerun the failed jobs of the same tag run.

Do not reintroduce a token fallback to get past an OIDC failure.

## Repository settings (not stored in workflow YAML)

- Protect `main` with required PR checks.
- Create an active tag ruleset for `v*` to restrict tag creation and prevent
  tag updates/deletion. Limit bypass permissions to the intended maintainer.
- Configure the `npm` environment's deployment rules and reviewers as needed.
- Consider immutable GitHub Releases once the release assets/notes are correct.

A workflow can enforce source ancestry, but it cannot substitute for these
repository and account settings. Password-change/login OTP emails also do not
identify their operator or prove which token is stored in GitHub.

References:

- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/generating-provenance-statements/
- https://docs.github.com/en/actions/reference/security/secure-use
