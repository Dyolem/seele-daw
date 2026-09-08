# Workbench Action Catalogue V1 phase plan

> Updated: 2026-09-08
>
> WA1: implemented and approved
>
> WA2: implemented and approved

## Design decision

The reviewed direction replaces the old combined Keyboard Coordinator. Existing infrastructure is
retained only where its ownership and semantics remain sound: Project commands and business owners,
the typed keymap, and the isolated TanStack browser adapter. Component-owned Action identities,
boolean-only execution results and combined Clear/Cancel intent are replaced in WA1.

## Batches

| Batch | Scope                                                                                                                                                                                      | State                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| WA1   | Immutable definitions, dynamic target lifetimes, explicit invocation/completion, input routing, bilingual terms, Save menu/button/shortcut slice, migration of existing keyboard consumers | Implemented; approved                             |
| WA2   | Remaining Workbench menus/buttons: Undo/Redo, Play/Pause, Return, Projects, both MIDI imports and opening the MIDI editor; shared presentation and shortcut text                           | Implemented; approved                             |
| WA3   | Focused-editor menu consumers and Reka Context Menu; explicit Note/CC64 target and one-command deletion                                                                                    | Authorized; right-click selection policy approved |
| WA4   | Phase-wide regression, failure/release checks, menu and focus review, macOS manual smoke, closure report                                                                                   | Not started                                       |

Each batch stops for review. WA1 does not imply approval to implement WA2–WA4 continuously.
Implementation and ownership are documented in [Studio Action Architecture](./studio-action-architecture.md).

## WA1 verification

The regression cases cover static catalogue availability, actions without key bindings, common Save
presentation and retry across three sources, asynchronous failures and invalidation, current-target
checks, Track/Clip replacement before old teardown, CC64 focus routing, Escape cancellation versus
selection clearing, IME filtering, platform Mod matching, canonical key conflicts, atomic browser
registration, Reka menu Escape and trigger-focus restoration. A failing editor focus query is also
verified not to disable Workbench Save.

Targeted Studio tests and type/architecture checks passed. Because WA1 replaces application
composition and injection used by existing consumers, the complete `pnpm check` gate was run and
passed on 2026-09-08:

| Gate                               | Result                         |
| ---------------------------------- | ------------------------------ |
| Architecture and workspace quality | Passed                         |
| Format, Oxlint and ESLint          | Passed                         |
| Workspace Type Check               | Passed                         |
| Workspace tests                    | 161 files / 1,419 tests passed |
| Studio subset                      | 66 files / 453 tests passed    |
| Studio Production Build            | Passed                         |
| Distributable local-audio boundary | Passed                         |

`git diff --check` passed. The verified implementation was based on
`db609533125e02d3ca2bd35e33ac450149505040`. WA1 was approved on 2026-09-08, with the architecture
narrative to be written in Chinese and the batch committed locally. Documentation-only updates are
checked for formatting and whitespace; they do not require rerunning the full test/build gate.

The phase-end macOS manual smoke remains in WA4; automated DOM tests do not claim to replace it.

## WA2 implementation and verification

Workbench menus, Transport controls, compact-layout navigation and Arrangement MIDI import buttons
now invoke the same application Actions. History and Playback groups expose the existing operations
in the Project menu. All consumers read the same presentation and platform-formatted shortcut hints;
the five new Actions have no default binding.

The page owns the native MIDI chooser and its pending completion. Chooser cancellation and rejected
navigation settle without claiming a business change. Session replacement retires a pending track
import's UI result; successful new-project import still completes its own route transition after
activating the new Session. Dock presentation reads the Workspace owner directly instead of keeping
a second open-state mirror in the Shell.

Validation passed on 2026-09-08 against changes based on WA1 commit `a18a005`:

| Gate                               | Result                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| Root `pnpm lint`                   | Architecture, workspace quality, format, Oxlint and ESLint passed |
| Studio Type Check                  | Passed                                                            |
| Complete Studio test suite         | 66 files / 481 tests passed                                       |
| Studio Production Build            | Passed                                                            |
| Distributable local-audio boundary | Passed                                                            |
| `git diff --check`                 | Passed                                                            |

The new regression cases verify History and playback across menu, toolbar and keyboard, Return
during loading, guarded navigation cancellation/failure and retry, synchronous native chooser
activation, shared MIDI busy state, late-result suppression, new-project navigation, and Dock
opening/restoration without a Project fact change. Existing Save and Reka keyboard/focus regressions
also pass. The build retains the existing large-chunk warning.

WA2 was approved for a local commit on 2026-09-08. WA3 implementation and its right-click policy are
approved: select an unselected Note or CC64 event first, retain multi-selection when clicking one of
its members, and show no menu when there is no executable action. WA4 has not started; full-workspace
`pnpm check` and macOS manual smoke remain phase-end gates.

## Deferred decisions and limits

- Keymap persistence, Settings, Recorder, sequences and Command Palette remain a possible V1B.
- Parameterized Add Track, instrument choice and Tempo editing do not justify a generic Action bus.
- ActiveProjectService, ProjectSession, History, Playback and editor selection retain ownership.
- No Core, audio, MIDI import semantics, existing MI6B–MI6D commits or soundbank routing is rebuilt.

After this phase, the remaining agreed sequence is Minimal Gesture / Semantic Layer, Velocity Editing,
then WAV Offline Export. CC64 and Expression Quality Integration are already complete.
