export class EditorPointerInputError extends Error {
  readonly code: 'invalid-pointer-input-configuration'

  constructor(code: 'invalid-pointer-input-configuration', message: string) {
    super(message)
    this.name = 'EditorPointerInputError'
    this.code = code
  }
}
