export const PROJECT_WORKBENCH_DOCK_MODE = {
  CLOSED: 'closed',
  DOCKED: 'docked',
  FULLSCREEN: 'fullscreen',
  MINIMIZED: 'minimized',
} as const

export type ProjectWorkbenchDockMode =
  (typeof PROJECT_WORKBENCH_DOCK_MODE)[keyof typeof PROJECT_WORKBENCH_DOCK_MODE]

export interface ProjectWorkbenchWorkspaceHandle {
  openContextEditor(): void
}
