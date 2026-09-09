<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
# Contributing

- [Bug reports](#bug-reports)
- [Feature requests](#feature-requests)
- [Pull requests](#pull-requests)
- [Development](#development)
- [Security issues](#security-issues)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

Thanks for wanting to help. The most useful contribution is a bug report from someone who ran into
the thing, with enough detail to reproduce it.

## Bug reports

Open an issue with the Obsidian version, the plugin version, your operating system, and what you did
before it went wrong. Sidebar arrangements are easy to get wrong in description and easy to see in a
picture, so a screenshot of the sidebar usually saves a round trip. If the plugin reported an error,
the console text belongs in the issue too.

## Feature requests

Open an issue describing what you are trying to arrange and what stops you. The plugin owns one
thing - the shape of a sidebar and getting back to a shape you saved. Anything that decides *when* a
layout should be applied belongs to whatever runs commands: a hotkey, a launcher, a rule in another
plugin. A layout is an ordinary Obsidian command, so those already work.

## Pull requests

Pull requests are welcome. To save us both from wasted work:

- **Claim the issue first.** Comment on it and wait before writing code. A change nobody agreed on
  is the one most likely to be closed.
- **Keep it narrow.** One change per pull request. A refactor bundled with a fix hides the fix.
- **`mise run check` has to pass.** It is the whole set of gates, and the pre-push hook runs it
  anyway. When a gate fails, the fix goes in the thing being measured, not in the measure.
- **Say how you verified it in Obsidian.** Automated tests cannot tell you how a panel actually
  lands on screen. Name the Obsidian version you ran against, and attach a screenshot for anything
  visible. A change to the interface or to `styles.css` is not finished until someone has looked at
  it in a running vault.
- **Conventional commits.** The commit-msg hook enforces them.
- **Do not commit `main.js`.** It is built from `src/` and ignored on purpose; the release workflow
  is what produces the copy people install.
- AI assistance is fine, and unread AI output is not. Read what you send.

## Development

```sh
mise install && mise run bootstrap   # tools, then dependencies
mise run dev                         # rebuild on save
VAULT=/path/to/vault mise run plugin:install
```

`plugin:install` builds and copies `main.js`, `manifest.json` and `styles.css` into that vault.
Reload the plugin in Obsidian afterwards, or the previous bundle keeps running.

| Task | What it checks or produces |
| --- | --- |
| `mise run lint` | Formatting and generic lint through flint |
| `mise run lint:code` | Obsidian rules and type-aware ESLint |
| `mise run test:types` | TypeScript for source and test fixtures |
| `mise run test:unit` | Unit and DOM tests |
| `mise run test:coverage` | Tests and coverage for all source modules |
| `mise run test:dead` | Unreachable files, unused exports, unresolved imports |
| `mise run test:release` | Agreement between the version, the changelog and the release files |
| `mise run test:styles` | Agreement between plugin CSS classes and source |
| `mise run check` | All gates, including the production build |
| `mise run fmt` | Apply the fixes supported by flint |

New code follows what is around it. A capability is a class of its own, algorithms are pure
functions, and a comment carries what the code cannot - a measurement, a constraint, the reason an
obvious alternative was rejected.

Releases are cut the way [.github/RELEASING.md](.github/RELEASING.md) describes.

## Security issues

Not here - see [SECURITY.md](SECURITY.md).
