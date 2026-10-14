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

## Enable npm Trusted Publishing

The workflow supports both authentication modes. The existing `NPM_TOKEN`
remains usable until account-side setup is complete; the presence of provenance
alone does not mean that Trusted Publishing is enabled.

1. In the npm package's Settings → Trusted Publisher, configure GitHub Actions:
   - owner: `dreamfarer-space`
   - repository: `deepseek-harness-intelligent-ui`
   - workflow filename: `release.yml`
   - environment: `npm`
   - allow direct `npm publish` for this workflow.
2. Set the GitHub repository/environment Actions variable
   `NPM_TRUSTED_PUBLISHING=true`. The publish step then passes an empty
   `NODE_AUTH_TOKEN`, preventing silent fallback to the existing token.
   It uses Node 24 and pinned npm 11.9.0 (OIDC needs Node ≥22.14 / npm ≥11.5.1).
3. Verify a new tag release uses OIDC successfully. Then revoke the obsolete
   granular token in npm and remove `NPM_TOKEN` from GitHub.

Do not enable the variable before npm has the matching trusted publisher.
Do not revoke the working credential before the replacement path is verified.
If the token path must remain, restrict it to this package, use the minimum
necessary permissions/expiry, and inspect its 2FA-bypass setting.

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
