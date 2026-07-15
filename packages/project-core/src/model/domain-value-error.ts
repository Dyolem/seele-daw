/** Raised when an untrusted primitive cannot enter the domain model. */
export class DomainValueError extends RangeError {
  readonly valueName: string
  readonly constraint: string

  constructor(valueName: string, constraint: string) {
    super(`Invalid ${valueName}: expected ${constraint}`)
    this.name = 'DomainValueError'
    this.valueName = valueName
    this.constraint = constraint
  }
}

export function rejectDomainValue(valueName: string, constraint: string): never {
  throw new DomainValueError(valueName, constraint)
}

export function requireFiniteNumber(value: unknown, valueName: string, constraint: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    rejectDomainValue(valueName, constraint)
  }

  return value
}
