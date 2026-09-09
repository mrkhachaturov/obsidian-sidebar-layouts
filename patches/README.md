# dnd-kit popout support

`dnd-kit-dom-0.5.0.patch` seeds the pointer sensor's document traversal with the
dragged element's document. Obsidian's separate settings window is outside the
main document's frame tree; without this patch, pointer movement and release are
never received there. Both ESM and CommonJS builds are patched.

`npm install` and `npm ci` apply the patch through `scripts/patch-dependencies.mjs`.
The script accepts an already applied patch and fails if the version or source
changes. Review this patch when upgrading dnd-kit. No dependency files need manual
editing.

The regression in `tests/ui/manageButtons.test.tsx` starts and releases a drag in a
document outside the main frame tree. It fails without the patch because the
drag remains active after release.
