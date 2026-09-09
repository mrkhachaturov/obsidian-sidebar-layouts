<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
# Releasing

- [What a release is](#what-a-release-is)
- [Cutting one](#cutting-one)
- [What the release notes are](#what-the-release-notes-are)
- [Actions](#actions)
- [The repository itself](#the-repository-itself)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

One version number, written once and read everywhere else. `mise run test:release` is that rule in
executable form and runs inside `mise run check`, so a disagreement fails on the pull request, long
before anyone releases anything.

## What a release is

A draft, until a person reads it. [`release.yml`](workflows/release.yml) is manual — Actions →
Draft release → Run workflow — and every run does the same thing:

1. Checks that `manifest.json`, `package.json`, `versions.json` and the `CHANGELOG.md` heading all
   say one version, and that the changelog section has something under it.
2. Runs every gate, the same `mise run check` that guards a pull request.
3. Reads the release body out of that changelog section. Nothing is retyped at release time.
4. Signs `main.js`, `manifest.json` and `styles.css` with build provenance, so an installed copy can
   be traced back to the run that produced it.
5. Drafts a release named after the manifest version, with those three files attached.

Publishing the draft is what releases. The tag is created from the manifest at that moment, so no
tag is ever typed and none can disagree with what is inside the plugin. It carries no `v`, because
that is how Obsidian's directory resolves a plugin release.

Which means a run costs nothing: dispatch it whenever you want to see the whole pipeline go green,
read the draft, and delete it if it was only a rehearsal. A second run replaces its own draft and
refuses to touch a version already published.

The workflow never decides a version. What the next number is, is not a robot's judgement.

## Cutting one

1. Choose the number. Semantic versioning against the plugin's own surface: a new setting or command
   is a minor, a fix is a patch, and a change that makes people reconfigure what they have is a
   major.
2. Rename `## Unreleased` in `CHANGELOG.md` to `## [X.Y.Z] - YYYY-MM-DD` and open a fresh
   `## Unreleased` above it.
3. Set the version in `manifest.json` and `package.json`, and add `"X.Y.Z": "<minAppVersion>"` to
   `versions.json`. `minAppVersion` is a claim that was tested against that Obsidian version, not an
   aspiration.
4. `mise run check`.
5. Merge to `main`, run the workflow, read the draft, publish it.

## What the release notes are

The changelog section, read by someone deciding whether to update. The rules are in the comment at
the top of `CHANGELOG.md`: categories in a fixed order, one line per change, plain statements of
what changed, the interface's own names for things, and a fix that says what was wrong.

## Actions

Every action is pinned to a commit SHA with its version in a trailing comment. The version is what
was current when the line was written, checked then, not copied from another repository.
[`dependabot.yml`](dependabot.yml) proposes the moves monthly; `zizmor` and `actionlint` read these
files as part of `mise run lint`.

## The repository itself

The scanning that runs beside the gates:

| Workflow | What it does |
| --- | --- |
| [`check.yml`](workflows/check.yml) | Every gate, on pull requests and pushes to `main` |
| [`codeql.yml`](workflows/codeql.yml) | CodeQL with `security-extended`, also weekly |
| [`dependency-review.yml`](workflows/dependency-review.yml) | Blocks a pull request adding a high-severity advisory |
| [`scorecard.yml`](workflows/scorecard.yml) | OpenSSF Scorecard, published |

Settings that are not files, and are set on the repository once: secret scanning and push protection
on, issues and discussions on, wiki and projects off, delete branch on merge on, and `main` protected
so the gates have to pass before anything lands on it.
