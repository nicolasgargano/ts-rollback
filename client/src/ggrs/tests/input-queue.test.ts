import { GameInput } from "../frame-info"
import { array, nonEmptyArray } from "fp-ts"
import * as assert from "assert"
import { InputQueue } from "../input-queue"
import { NULL_FRAME } from "../lib"

describe("InputQueue tests", () => {
  test("add input wrong frame", () => {
    const queue = new InputQueue(0, 4)
    const input = new GameInput(0, 4)
    queue.addInputWithFrameDelay(input) // Fine
    const inputWithWrongFrame = new GameInput(3, 4)
    expect(() => {
      queue.addInputWithFrameDelay(inputWithWrongFrame) // Not fine
    }).toThrow()
  })
  test("add input twice", () => {
    const queue = new InputQueue(0, 4)
    const input = new GameInput(0, 4)
    queue.addInputWithFrameDelay(input) // Fine
    expect(() => {
      queue.addInputWithFrameDelay(input) // Not Fine
    })
  })
  test("add input sequentially", () => {
    const queue = new InputQueue(0, 4)
    nonEmptyArray.range(0, 9).forEach(frame => {
      const input = new GameInput(frame, 4)
      queue.addInputWithFrameDelay(input)
      assert(queue.lastAddedFrame === frame)
      assert(queue.length === frame + 1)
      const inputInQueue = queue.inputOrPredict(frame)
      assert(inputInQueue.equal(input, false))
    })
  })
  test("delayed inputs", () => {
    const queue = new InputQueue(0, 4)
    const delay = 2
    queue.frameDelay = delay
    nonEmptyArray.range(0, 9).forEach(frame => {
      const input = new GameInput(frame, 4)
      const serializedInputs = new Uint8Array([0, 0, 0, 0])
      input.copyInput(serializedInputs)
      queue.addInputWithFrameDelay(input)
      assert(queue.lastAddedFrame === frame + delay)
      assert(queue.length === frame + delay + 1)
      const inputInQueue = queue.inputOrPredict(frame + delay)
      assert(inputInQueue.equal(input, true))
    })
  })
})
