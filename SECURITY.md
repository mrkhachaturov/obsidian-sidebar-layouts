# Security policy

## Supported versions

Fixes go into the next release. Older releases are not maintained separately.

## Reporting a vulnerability

Report it privately, through GitHub's private vulnerability reporting:
<https://github.com/mrkhachaturov/obsidian-sidebar-layouts/security/advisories/new>.

If that is unavailable to you, open an issue asking for a private channel and leave the details out
of it.

Include the plugin version, the Obsidian version, the platform, and how to reproduce it. A report is
reviewed before anything is disclosed publicly; when a fix is released, the advisory says who
reported it unless you would rather it did not.

## What this plugin can reach

It makes no network requests, and it does not read or write notes. It rearranges panels in the
sidebars and stores its own layouts in `data.json` inside its plugin folder. Released files carry
build provenance, so a copy can be traced back to the workflow run that produced it.
