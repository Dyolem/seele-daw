import { computed, shallowRef, type ShallowRef } from 'vue'
import { useElementHeight } from '@/ui/hooks/use-element-height'

const TEMPO_HEADER_HEIGHT = 32
const TEMPO_EDITOR_HEIGHT = 144
const MINIMUM_TRACK_HEIGHT = 96
const SCROLLBAR_ALLOWANCE = 16

/** Both Timeline and Track controls consume one effective Tempo section height. */
export function useTempoLaneLayout(
  surface: Readonly<ShallowRef<HTMLElement | null>>,
  trackPanel: Readonly<ShallowRef<HTMLElement | null>>,
) {
  const surfaceSize = useElementHeight(surface)
  const chromeSize = useElementHeight(trackPanel)
  const preferredExpanded = shallowRef(false)
  const canExpand = computed(
    () =>
      surfaceSize.height.value >=
      chromeSize.height.value +
        TEMPO_HEADER_HEIGHT +
        TEMPO_EDITOR_HEIGHT +
        MINIMUM_TRACK_HEIGHT +
        SCROLLBAR_ALLOWANCE,
  )
  const expanded = computed(() => preferredExpanded.value && canExpand.value)
  const style = computed(() => ({
    '--project-workbench-tempo-track-height': `${TEMPO_HEADER_HEIGHT + (expanded.value ? TEMPO_EDITOR_HEIGHT : 0)}px`,
    '--project-workbench-tempo-header-height': `${TEMPO_HEADER_HEIGHT}px`,
  }))
  function dispose(): void {
    chromeSize.dispose()
    surfaceSize.dispose()
  }
  function mount(): void {
    try {
      surfaceSize.mount()
      chromeSize.mount()
    } catch (cause) {
      dispose()
      throw cause
    }
  }
  return {
    expanded,
    canExpand,
    style,
    toggle: () => {
      preferredExpanded.value = !expanded.value
    },
    mount,
    dispose,
  }
}
