# Workspace Quality Rules

Repository-root scripts and configuration are the only authority for formatting and linting.
Workspace packages expose the same command names only as delegates, so running `pnpm lint` from a
feature directory cannot silently select a different tool set.

`check-workspace-quality-scripts.mjs` is part of the root lint gate. It rejects missing or divergent
package delegates before the remaining quality tools run.
