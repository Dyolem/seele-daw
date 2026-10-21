import { computed, shallowRef, type ShallowRef } from 'vue'
import { useElementHeight } from '@/ui/hooks/use-element-height'
import {
  PROJECT_WORKBENCH_DOCK_MODE,
  type ProjectWorkbenchDockMode,
} from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import { resolveWorkspaceLayout, WORKSPACE_DEFAULT_DOCK_HEIGHT } from './workspace-layout-policy'

/** Keeps the preferred dock size independent from temporary viewport constraints. */
export function useWorkspaceLayout(element: Readonly<ShallowRef<HTMLElement | null>>) {
  const measurement = useElementHeight(element)
  const mode = shallowRef<ProjectWorkbenchDockMode>(PROJECT_WORKBENCH_DOCK_MODE.DOCKED)
  const preferredHeight = shallowRef(WORKSPACE_DEFAULT_DOCK_HEIGHT)
  const maximized = shallowRef(false)
  let resizeOrigin: { height: number; maximized: boolean } | null = null
  const activePane = shallowRef<'arrangement' | 'midi'>('midi')
  const layout = computed(() =>
    resolveWorkspaceLayout(
      measurement.height.value,
      mode.value,
      preferredHeight.value,
      maximized.value,
      activePane.value,
    ),
  )
  const style = computed(() => ({
    gridTemplateRows: `${layout.value.arrangementHeight}px ${layout.value.splitterHeight}px ${layout.value.dockHeight}px`,
    '--project-workbench-dock-height': `${layout.value.dockHeight}px`,
  }))
  function open(): void {
    if (mode.value !== PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN)
      mode.value = PROJECT_WORKBENCH_DOCK_MODE.DOCKED
    activePane.value = 'midi'
  }
  function close(): void {
    mode.value = PROJECT_WORKBENCH_DOCK_MODE.CLOSED
  }
  function toggleMinimized(): void {
    if (layout.value.dockMode === PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED) open()
    else mode.value = PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED
  }
  function toggleFullscreen(): void {
    if (mode.value === PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN)
      mode.value = PROJECT_WORKBENCH_DOCK_MODE.DOCKED
    else {
      mode.value = PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN
      activePane.value = 'midi'
    }
  }
  function resize(height: number): void {
    preferredHeight.value = height
    maximized.value = false
  }
  function beginResize(): void {
    resizeOrigin = { height: preferredHeight.value, maximized: maximized.value }
  }
  function endResize(cancelled: boolean): void {
    if (cancelled && resizeOrigin) {
      preferredHeight.value = resizeOrigin.height
      maximized.value = resizeOrigin.maximized
    }
    resizeOrigin = null
  }
  function activateMidi(): void {
    if (layout.value.dockMode !== PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED) activePane.value = 'midi'
  }
  return {
    mode,
    layout,
    style,
    preferredHeight,
    maximized,
    open,
    close,
    toggleMinimized,
    toggleFullscreen,
    resize,
    beginResize,
    endResize,
    activateMidi,
    activateArrangement: () => {
      activePane.value = 'arrangement'
    },
    toggleMaximized: () => {
      maximized.value = !maximized.value
    },
    mount: measurement.mount,
    dispose: measurement.dispose,
  }
}
