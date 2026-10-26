/** What differs between two versions of one ID-ordered Snapshot table or partition. */
export interface SnapshotRecordChanges<RecordType> {
  /** IDs whose previous record is gone: removed, or replaced by a rewritten record. */
  readonly droppedIds: ReadonlySet<string>
  /** Records new in the next version, added or rewritten, in ID order. */
  readonly written: readonly RecordType[]
}

/**
 * Compares two versions of the same ID-ordered records, such as a Source's Notes in two
 * Snapshots. A record no commit wrote is the same object in both (ADR-007), so one walk finds the
 * records that changed, and a consumer can keep what it derived from the others.
 */
export function diffSnapshotRecords<RecordType extends { readonly id: string }>(
  previous: readonly RecordType[],
  next: readonly RecordType[],
): SnapshotRecordChanges<RecordType> {
  const droppedIds = new Set<string>()
  const written: RecordType[] = []
  let previousIndex = 0
  let nextIndex = 0

  while (previousIndex < previous.length || nextIndex < next.length) {
    const before = previous[previousIndex]
    const after = next[nextIndex]
    if (before === after) {
      previousIndex += 1
      nextIndex += 1
    } else if (after === undefined || (before !== undefined && before.id < after.id)) {
      droppedIds.add(before!.id)
      previousIndex += 1
    } else {
      if (before?.id === after.id) {
        droppedIds.add(before.id)
        previousIndex += 1
      }
      written.push(after)
      nextIndex += 1
    }
  }
  return { droppedIds, written }
}
