/** Raised when a stored or imported project file, or the Checkpoint around it, cannot be read. */
export class ProjectFileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectFileError'
  }
}
