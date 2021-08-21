import { SerializedGameInput } from "../SerializedGameInput"
import { nonEmptyArray } from "fp-ts"
import { assert } from "../assert"
import { InputQueue } from "../structs/InputQueue"
import * as inputQueue from "../structs/InputQueue"
import { NULL_FRAME } from "../types"
import { gameInputCircularBuffer } from "../structs/GameInputCircularBuffer"

describe("Input Queue", () => {
  test("Can't add input on wrong frame", () => {
    const frameDelay = 0
    const queue: InputQueue = inputQueue.makeDefault(2)

    const input = new SerializedGameInput(0, 2, new Uint8Array(2))
    inputQueue.addInputWithFrameDelay(frameDelay, input)(queue) // Should not throw

    const inputWithWrongFrame = new SerializedGameInput(3, 2, new Uint8Array(2))
    expect(() => {
      inputQueue.addInputWithFrameDelay(frameDelay, inputWithWrongFrame)(queue)
    }).toThrow()
  })
  test("Can't add input twice", () => {
    const frameDelay = 0
    const queue: InputQueue = inputQueue.makeDefault(2)

    const input = new SerializedGameInput(0, 2, new Uint8Array(2))
    inputQueue.addInputWithFrameDelay(frameDelay, input)(queue) // Should not throw
    expect(() => {
      inputQueue.addInputWithFrameDelay(frameDelay, input)(queue)
    }).toThrow()
  })
  test("Add input sequentially", () => {
    const frameDelay = 0
    const queue: InputQueue = inputQueue.makeDefault(2)

    nonEmptyArray.range(0, 9).forEach(frame => {
      const input = new SerializedGameInput(frame, 2, new Uint8Array(2))

      inputQueue.addInputWithFrameDelay(frameDelay, input)(queue)

      // assert.primitiveEqual(queue.lastAddedFrame, frame)
      assert.primitiveEqual(queue.inputs.currentFrame(), frame)
      assert.primitiveEqual(queue.inputs.currentFrame(), frame)
      assert.primitiveEqual(queue.inputs.size(), frame + 1)

      const inputInQueue = inputQueue.confirmedOrPredicted(frame)(queue)

      assert.truthy(SerializedGameInput.equals(input, inputInQueue, false))
    })
  })
  test("delayed inputs", () => {
    const frameDelay = 2
    const queue: InputQueue = inputQueue.makeDefault(2)
    const inputSize = 2

    nonEmptyArray.range(0, 9).forEach(frame => {
      const serializedInput = new Uint8Array(inputSize).fill(frame)
      const input = new SerializedGameInput(frame, inputSize, serializedInput)

      inputQueue.addInputWithFrameDelay(frameDelay, input, true)(queue)
      // assert.primitiveEqual(queue.lastAddedFrame, frame + frameDelay)
      assert.primitiveEqual(queue.inputs.currentFrame(), frame + frameDelay)
      assert.primitiveEqual(queue.inputs.size(), frame + 1 + frameDelay)

      const inputInQueue = inputQueue.confirmedOrPredicted(frame + frameDelay)(queue)
      assert.truthy(input.frame + frameDelay === inputInQueue.frame)
      assert.truthy(SerializedGameInput.equalInput(input, inputInQueue))
    })
  })
  test("Predictions", () => {
    const frameDelay = 2
    const queue: InputQueue = inputQueue.makeDefault(2)

    nonEmptyArray.range(0, 100).forEach(frame => {
      const inputInQueue = inputQueue.confirmedOrPredicted(frame + frameDelay)(queue)
      assert.primitiveEqual(inputInQueue.frame, frame + frameDelay)
    })
  })
  test("Predictions and then confirmed", () => {
    const frameDelay = 2
    const inputSize = 2

    const queue: InputQueue = {
      // exitPredictionCount: 0,
      // lastAddedFrame: NULL_FRAME,
      lastRequestedFrame: NULL_FRAME,
      firstIncorrectFrame: NULL_FRAME,
      prediction: new SerializedGameInput(NULL_FRAME, inputSize, new Uint8Array(inputSize)),
      inputs: gameInputCircularBuffer.empty(inputSize, 32)
    }
    const confirmedEvery = 5

    let confirmedFrameToAdd = frameDelay
    let more: boolean = false

    nonEmptyArray.range(0, 100).forEach(frame => {
      if (frame % confirmedEvery === confirmedEvery - 1) {
        for (let i = 0; i < (more ? confirmedEvery * 2 : confirmedEvery); i++) {
          const input = new SerializedGameInput(confirmedFrameToAdd, 2, new Uint8Array(2))
          inputQueue.addInputWithFrameDelay(frameDelay, input)(queue)
          confirmedFrameToAdd++
        }
        more = true
      }

      const inputInQueue = inputQueue.confirmedOrPredicted(frame)(queue)
      assert.primitiveEqual(inputInQueue.frame, frame)
    })
  })
  test("Predictions and then confirmed steps", () => {
    const frameDelay = 3
    const inputSize = 3

    const queue: InputQueue = {
      // exitPredictionCount: 0,
      // lastAddedFrame: NULL_FRAME,
      lastRequestedFrame: NULL_FRAME,
      firstIncorrectFrame: NULL_FRAME,
      prediction: new SerializedGameInput(NULL_FRAME, inputSize, new Uint8Array(inputSize)),
      inputs: gameInputCircularBuffer.empty(inputSize, 32)
    }

    let frame = 0
    let confirmedFrameToAdd = frameDelay

    const askInput = () => {
      let inputInQueue = inputQueue.confirmedOrPredicted(frame)(queue)
      assert.primitiveEqual(inputInQueue.frame, frame)
      frame++
    }

    const addInput = () => {
      let input = new SerializedGameInput(confirmedFrameToAdd, inputSize, new Uint8Array(inputSize))
      inputQueue.addInputWithFrameDelay(0, input, true)(queue)
      confirmedFrameToAdd++
    }

    askInput() // ask 0 as prediction
    askInput() // ask 1 as prediction
    askInput() // ask 2 as prediction

    addInput() // add input 3

    askInput() // ask 3 as confirmed
    askInput() // ask 4 as prediction
    askInput() // ask 5 as prediction

    addInput() // add input 4
  })

  test("Predictions and then confirmed steps without delay", () => {
    const inputSize = 3

    const queue: InputQueue = {
      // exitPredictionCount: 0,
      // lastAddedFrame: NULL_FRAME,
      lastRequestedFrame: NULL_FRAME,
      firstIncorrectFrame: NULL_FRAME,
      prediction: new SerializedGameInput(NULL_FRAME, inputSize, new Uint8Array(inputSize)),
      inputs: gameInputCircularBuffer.empty(inputSize, 32)
    }

    let frame = 0
    let confirmedFrameToAdd = frame

    const askInput = () => {
      let inputInQueue = inputQueue.confirmedOrPredicted(frame)(queue)
      assert.primitiveEqual(inputInQueue.frame, frame)
      frame++
    }

    const addInput = () => {
      const serializedInput = new Uint8Array(inputSize)
      let input = new SerializedGameInput(confirmedFrameToAdd, inputSize, serializedInput)
      inputQueue.addInputByFrame(input, confirmedFrameToAdd)(queue)
      confirmedFrameToAdd++
    }

    // last: -1     incorrect: -1     pred: -1    next: 0
    askInput() // ask 0 as prediction
    // last:  0     incorrect: -1     pred:  0    next: 0
    askInput() // ask 1 as prediction
    // last:  1     incorrect: -1     pred:  0    next: 0
    askInput() // ask 2 as prediction

    addInput()
    addInput()
    addInput()
    addInput() // add input 3

    askInput() // ask 3 as confirmed
    askInput() // ask 4 as prediction
    askInput() // ask 5 as prediction

    addInput() // add input 4
  })
})

/*

InputQueue.ts:90        [ inputQueue ] Requested frame 0 was returned as prediction
InputQueue.ts:90        [ inputQueue ] Requested frame 1 was returned as prediction
InputQueue.ts:90        [ inputQueue ] Requested frame 2 was returned as prediction
peerjs-session.ts:786   [update last frame] current: -1, new: 3
InputQueue.ts:132       Could not cancel prediction, 1
InputQueue.ts:132       Could not cancel prediction, 2
InputQueue.ts:126       Cancelling prediction, pred, 2, inputFrame 2, addTo frame: 2
InputQueue.ts:113       [ input queue ] was not predicting! 3, -1
InputQueue.ts:75        [ inputQueue ] Requested frame 3 was returned as confirmed
InputQueue.ts:90        [ inputQueue ] Requested frame 4 was returned as prediction
InputQueue.ts:90        [ inputQueue ] Requested frame 5 was returned as prediction
peerjs-session.ts:786   [update last frame] current: 3, new: 4

 */
