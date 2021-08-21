import { Frame } from "../types"
import { SerializedGameInput } from "../SerializedGameInput"
import { assert } from "../assert"
import {
  gameInputCircularBuffer,
  GameInputCircularBuffer
} from "../structs/GameInputCircularBuffer"

describe("GameInput Circular Buffer", () => {
  const makeGI = (frame: Frame) => new SerializedGameInput(frame, 1, new Uint8Array([1]))

  test("Puts and overflows", () => {
    const rb: GameInputCircularBuffer = gameInputCircularBuffer.empty(1, 5)

    rb.add(makeGI(0))
    assert.primitiveEqual(rb.getFrameInput(0)?.frame, 0)

    rb.add(makeGI(1))
    rb.add(makeGI(2))
    rb.add(makeGI(3))
    rb.add(makeGI(4))
    assert.primitiveEqual(rb.getFrameInput(2)?.frame, 2)
    assert.primitiveEqual(rb.getFrameInput(4)?.frame, 4)

    rb.add(makeGI(5))
    assert.primitiveEqual(rb.getFrameInput(0)?.frame, undefined)
    assert.primitiveEqual(rb.getFrameInput(5)?.frame, 5)
  })

  test("Frame counts", () => {
    const rb: GameInputCircularBuffer = gameInputCircularBuffer.empty(1, 5)

    assert.isNullFrame(rb.currentFrame())
    assert.isNullFrame(rb.previousFrame())

    rb.add(makeGI(0))
    assert.isNullFrame(rb.previousFrame())
    assert.primitiveEqual(rb.currentFrame(), 0)

    rb.add(makeGI(1))
    rb.add(makeGI(2))

    assert.primitiveEqual(rb.previousFrame(), 1)
    assert.primitiveEqual(rb.currentFrame(), 2)

    rb.add(makeGI(3))
    rb.add(makeGI(4))

    rb.add(makeGI(5))
    assert.primitiveEqual(rb.previousFrame(), 4)
    assert.primitiveEqual(rb.currentFrame(), 5)
  })

  test("Tail frame", () => {
    const rb: GameInputCircularBuffer = gameInputCircularBuffer.empty(1, 5)

    rb.add(makeGI(0))
    assert.primitiveEqual(rb.tailFrame(), -1)

    rb.add(makeGI(1))
    assert.primitiveEqual(rb.tailFrame(), -1)

    rb.add(makeGI(2))
    assert.primitiveEqual(rb.tailFrame(), -1)

    rb.add(makeGI(3))
    assert.primitiveEqual(rb.tailFrame(), -1)

    rb.add(makeGI(4))
    assert.primitiveEqual(rb.tailFrame(), 0)

    rb.add(makeGI(5))
    assert.primitiveEqual(rb.tailFrame(), 1)

    rb.add(makeGI(6))
    assert.primitiveEqual(rb.tailFrame(), 2)
  })
})
