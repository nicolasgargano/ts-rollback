import { SerializedGameInput } from "../SerializedGameInput"
import { nonEmptyArray } from "fp-ts"
import { Frame, NULL_FRAME } from "../types"

/*


-- STRUCTURE


*/

export class GameInputCircularBuffer {
  nextFrame: number
  arr: SerializedGameInput[]

  constructor(nextHead: number, arr: SerializedGameInput[]) {
    this.nextFrame = nextHead
    this.arr = arr
  }

  add = (input: SerializedGameInput) => {
    const arrPos = this.nextFrame % this.arr.length
    this.arr[arrPos].frame = input.frame
    this.arr[arrPos].inputSize = input.inputSize
    this.arr[arrPos].copyIntoBuffer(input.buffer)
    this.nextFrame++
  }

  size = () => this.nextFrame

  currentFrame = () => this.nextFrame - 1
  currentFrameInput = () => this.getFrameInput(this.currentFrame())

  previousFrame = () => (this.nextFrame - 2 < 0 ? NULL_FRAME : this.nextFrame - 2)
  previousFrameInput = () => this.getFrameInput(this.previousFrame())

  getFrameInput = (frame: number): SerializedGameInput | undefined =>
    this.hasFrame(frame) ? this.arr[frame % this.arr.length] : undefined

  hasFrame = (frame: number): boolean =>
    frame > NULL_FRAME && frame < this.nextFrame && this.nextFrame - frame <= this.arr.length

  tailFrame = (): Frame => Math.max(NULL_FRAME, this.nextFrame - this.arr.length)

  isEmpty = () => this.nextFrame === 0
}

/*


-- CONSTRUCTORS


*/

const empty = (inputSize: number, capacity: number): GameInputCircularBuffer =>
  new GameInputCircularBuffer(
    0,
    nonEmptyArray.makeBy(
      _ => new SerializedGameInput(NULL_FRAME, inputSize, new Uint8Array(inputSize))
    )(capacity)
  )

/*


-- MODULE


*/

export const gameInputCircularBuffer = {
  empty
}
