import type { ProjectChange, ProjectCommit } from '#internal/index'

type ChangeTable = ProjectChange['table']
type ChangeOperation = ProjectChange['op']

export type ChangeOf<Table extends ChangeTable, Operation extends ChangeOperation> = Extract<
  ProjectChange,
  { readonly table: Table; readonly op: Operation }
>

type ChangeSource = ProjectCommit | readonly ProjectChange[] | null | undefined

function changesOf(source: ChangeSource): readonly ProjectChange[] {
  if (source === null || source === undefined) return []
  return 'changes' in source ? source.changes : source
}

/** What a change addresses: a record ID, a partition's Source, or the Track it orders. */
function addressOf(change: ProjectChange): string {
  switch (change.table) {
    case 'project':
      return change.after.id
    case 'master':
      return ''
    case 'trackOrder':
      return change.trackId
    default:
      if (change.op === 'insert-partition' || change.op === 'remove-partition') {
        return change.sourceId
      }
      return change.op === 'insert' ? change.after.id : change.before.id
  }
}

/** Lists changes as "table.op address" lines, which read better in assertions than objects. */
export function describeChanges(source: ChangeSource): readonly string[] {
  return changesOf(source).map((change) =>
    `${change.table}.${change.op} ${addressOf(change)}`.trimEnd(),
  )
}

/** Returns the one change with this table and operation, failing unless there is exactly one. */
export function requireChange<Table extends ChangeTable, Operation extends ChangeOperation>(
  source: ChangeSource,
  table: Table,
  op: Operation,
): ChangeOf<Table, Operation> {
  const matches = changesOf(source).filter((change) => change.table === table && change.op === op)
  if (matches.length !== 1) {
    throw new Error(`Expected one ${table}.${op} change, found ${matches.length}`)
  }
  return matches[0] as ChangeOf<Table, Operation>
}
