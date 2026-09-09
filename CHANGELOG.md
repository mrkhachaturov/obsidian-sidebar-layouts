# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version in the heading, in `manifest.json`, in `versions.json` and on the git tag is one number.
A release copies its section from this file and nothing is retyped: `mise run test:release` refuses a
release where those four disagree.

<!-- How an entry is written:

- Categories are Added, Changed, Deprecated, Removed, Fixed and Security, in that order. A category
  with nothing under it is left out.
- One line per change, saying what changed - not what it is worth. No "powerful", "seamlessly",
  "greatly improved": an adjective a reader cannot check is noise.
- Name things the way the interface names them, so a reader can go and find them.
- A fix says what was wrong. "Fixed a bug" matches nobody's problem.
- Write it for the person installing the update, not for the person who wrote the commit.

## [9.9.9] - 9090-09-09

### Added
### Changed
### Fixed

-->

## Unreleased

## [0.1.1] - 2026-09-09

### Changed

- The plugin builds with npm alone, so the community directory can reproduce the released files.
- One fewer dependency: the list of Node's built-in modules comes from Node itself.

### Fixed

- The buttons in the window header no longer make Obsidian re-evaluate the tab strip's styles every
  time a tab is opened, closed or dragged.

## [0.1.0] - 2026-09-09

### Added

- Named arrangements of the left and right sidebars: which panel is on top, which are stacked below,
  and at what heights. Each sidebar keeps its own layouts and its own active one.
- Buttons that apply a layout or run any command, placed in the window header or in a row below the
  panel tabs, and reorderable by dragging or from the keyboard.
- A command per layout, so a layout can be applied from a hotkey or from anything else that runs
  commands, and two commands per sidebar to pick a layout or to save the current arrangement.
- Changes made to a layout after it was saved are remembered as its working arrangement, and can be
  saved into the layout or discarded from the settings or the button's menu.
- Full width for notes: while a note is on top of the sidebar, the panels below are parked and come
  back at their stored heights.
- Hiding the tab headers of the panels the layouts control, and an option to keep a header button
  visible while its sidebar is closed.
- A public API at `app.plugins.plugins['sidebar-layouts'].api` for reading, applying and capturing
  layouts.
- Translated interface following the language selected in Obsidian.
