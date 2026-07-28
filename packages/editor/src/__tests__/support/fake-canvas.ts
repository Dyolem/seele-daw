export interface CanvasOperation {
  readonly arguments: readonly number[]
  readonly name: string
}

export interface FakeCanvasFixture {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
  readonly operations: readonly CanvasOperation[]
}

export function createFakeCanvasFixture(): FakeCanvasFixture {
  const operations: CanvasOperation[] = []
  const record = (name: string, ...arguments_: number[]): void => {
    operations.push(Object.freeze({ arguments: Object.freeze(arguments_), name }))
  }

  const context = {
    beginPath: () => record('beginPath'),
    clearRect: (...arguments_: number[]) => record('clearRect', ...arguments_),
    clip: () => record('clip'),
    fillRect: (...arguments_: number[]) => record('fillRect', ...arguments_),
    fillStyle: '',
    globalAlpha: 1,
    lineTo: (...arguments_: number[]) => record('lineTo', ...arguments_),
    lineWidth: 1,
    moveTo: (...arguments_: number[]) => record('moveTo', ...arguments_),
    rect: (...arguments_: number[]) => record('rect', ...arguments_),
    restore: () => record('restore'),
    save: () => record('save'),
    setTransform: (...arguments_: number[]) => record('setTransform', ...arguments_),
    shadowBlur: 0,
    shadowColor: '',
    stroke: () => record('stroke'),
    strokeRect: (...arguments_: number[]) => record('strokeRect', ...arguments_),
    strokeStyle: '',
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    getContext: (contextId: string) => (contextId === '2d' ? context : null),
    height: 0,
    style: {},
    width: 0,
  } as unknown as HTMLCanvasElement

  return { canvas, context, operations }
}
