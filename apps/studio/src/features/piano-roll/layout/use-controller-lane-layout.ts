import { computed, type ShallowRef } from 'vue'
import { useElementHeight } from '@/ui/hooks/use-element-height'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import {
  PIANO_ROLL_TOOLBAR_HEIGHT,
  PIANO_ROLL_RULER_HEIGHT,
  resolveControllerLaneLayout,
} from './controller-lane-policy'

export function useControllerLaneLayout(surface: Readonly<ShallowRef<HTMLElement | null>>) {
  const size = useElementHeight(surface)
  const preferences = usePianoRollPreferencesStore()
  const layout = computed(() =>
    resolveControllerLaneLayout(
      size.height.value,
      preferences.controllerLaneExpanded,
      preferences.controllerLaneHeight,
    ),
  )
  const style = computed(() => ({
    '--piano-roll-toolbar-height': `${PIANO_ROLL_TOOLBAR_HEIGHT}px`,
    '--piano-roll-ruler-height': `${PIANO_ROLL_RULER_HEIGHT}px`,
    '--piano-roll-controller-height': `${layout.value.bodyHeight}px`,
    '--piano-roll-controller-header-height': `${layout.value.headerHeight}px`,
  }))
  return { layout, style, mount: size.mount, dispose: size.dispose }
}
