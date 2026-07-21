import { rejectDomainValue } from '#internal/model/domain-value-error'

const OPAQUE_ID_CONSTRAINT =
  'a non-empty opaque string without surrounding whitespace or control characters'

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)

    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
  })
}

/** @internal Shared runtime boundary for all nominal opaque string ID domains. */
export function parseOpaqueId<Id extends string>(value: unknown, valueName: string): Id {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    containsControlCharacter(value)
  ) {
    rejectDomainValue(valueName, OPAQUE_ID_CONSTRAINT)
  }

  return value as Id
}
