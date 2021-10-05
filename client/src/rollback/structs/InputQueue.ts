import { nonEmptyArray } from "fp-ts"
import { SerializedGameInput } from "../SerializedGameInput"
import { assert } from "../assert"
import { gameInputCircularBuffer, GameInputCircularBuffer } from "./GameInputCircularBuffer"
import { Frame, isNullFrame, notNullFrame, NULL_FRAME } from "../types"

/*


-- STRUCTURE


*/

export type InputQueue = {
  lastRequestedFrame: Frame
  firstIncorrectFrame: Frame
  prediction: SerializedGameInput

  inputs: GameInputCircularBuffer
}

/*


-- CONSTRUCTORS


*/

export const makeDefault = (inputSize: number): InputQueue => ({
  // exitPredictionCount: 0,
  // lastAddedFrame: NULL_FRAME,
  lastRequestedFrame: NULL_FRAME,
  firstIncorrectFrame: NULL_FRAME,
  prediction: new SerializedGameInput(NULL_FRAME, inputSize, new Uint8Array(inputSize)),
  inputs: gameInputCircularBuffer.empty(inputSize, 300)
})

/*


OPERATIONS


 */

export const confirmedOrPredicted =
  (requestedFrame: Frame) =>
  (queue: InputQueue): SerializedGameInput => {
    assert.isNullFrame(queue.firstIncorrectFrame)
    assert.expr(queue.inputs.isEmpty() || requestedFrame >= queue.inputs.tailFrame(), ``)

    queue.lastRequestedFrame = requestedFrame

    if (!wasPredicting(queue)) {
      const maybeConfirmedInput = queue.inputs.getFrameInput(requestedFrame)

      if (maybeConfirmedInput) {
        assert.primitiveEqual(maybeConfirmedInput.frame, requestedFrame)
        // console.debug(`[ inputQueue ] Requested frame ${requestedFrame} was returned as confirmed`)
        return maybeConfirmedInput
      } else {
        const maybeCurrent = queue.inputs.currentFrameInput()

        if (maybeCurrent) queue.prediction.copyFrom(maybeCurrent)
        else queue.prediction.clearBuffer()
      }
      queue.prediction.frame = queue.prediction.frame + 1
    }
    assert.notNullFrame(queue.prediction.frame)
    const predictionToReturn = SerializedGameInput.clone(queue.prediction)
    predictionToReturn.frame = requestedFrame
    // queue.prediction.frame = requestedFrame
    // console.debug(`[ inputQueue ] Requested frame ${requestedFrame} was returned as prediction`)
    return predictionToReturn
  }

export const addInputByFrame =
  (input: SerializedGameInput, frame: Frame) => (queue: InputQueue) => {
    assert.primitiveEqual(input.inputSize, queue.prediction.inputSize)
    // assert.isSequentialFrame(queue.lastAddedFrame, frame)
    assert.isSequentialFrame(queue.inputs.currentFrame(), frame)
    assert.truthy(frame === 0 || queue.inputs.currentFrameInput()?.frame === frame - 1)

    const inputToAdd = SerializedGameInput.clone(input)
    inputToAdd.frame = frame
    queue.inputs.add(inputToAdd)
    // queue.lastAddedFrame = frame

    if (wasPredicting(queue)) {
      assert.primitiveEqual(frame, queue.prediction.frame)

      const canCancelPrediction =
        noIncorrectFrame(queue) && queue.prediction.frame === queue.lastRequestedFrame
      if (canCancelPrediction) {
        // queue.exitPredictionCount++
        // console.debug(
        //   `Cancelling pred, pred ${queue.prediction.frame}, inputF ${inputToAdd.frame}, addF: ${frame}`
        // )
        queue.prediction.frame = NULL_FRAME
      } else {
        queue.prediction.frame = queue.prediction.frame + 1
        // console.debug(`Could not cancel prediction, ${queue.prediction.frame}`)
      }

      if (
        noIncorrectFrame(queue) &&
        !SerializedGameInput.equals(queue.prediction, inputToAdd, true)
      )
        queue.firstIncorrectFrame = frame
    } else {
      // console.debug(`[ input queue ] was not predicting! ${frame}, ${queue.prediction.frame}`)
    }
    // TODO ggrs checks if the length after inserting exceeds a max input q length,
    //  because our circular buffer just overwrites we may need
    //  a different assertion or non at all
  }

export const addInputWithFrameDelay =
  (frameDelay: number, input: SerializedGameInput, remote = false) =>
  (queue: InputQueue): Frame => {
    assert.isSequentialFrame(queue.inputs.currentFrame(), input.frame + frameDelay)
    // assert.isSequentialFrame(queue.lastAddedFrame, input.frame + frameDelay)

    // React to possible frame delay changes
    let expectedFrame = queue.inputs.nextFrame
    const inputFrameWithDelay = input.frame + frameDelay

    if (expectedFrame > inputFrameWithDelay) {
      return NULL_FRAME
    } else {
      while (expectedFrame < inputFrameWithDelay) {
        const replicatedInputToAdd = SerializedGameInput.clone(
          queue.inputs.currentFrameInput() ??
            new SerializedGameInput(NULL_FRAME, input.inputSize, new Uint8Array(input.inputSize))
        )
        addInputByFrame(replicatedInputToAdd, expectedFrame)(queue)
        expectedFrame++
      }
      addInputByFrame(input, inputFrameWithDelay)(queue)
    }

    // TODO how do we know there is an input there
    assert.truthy(
      input.frame === 0 || inputFrameWithDelay === queue.inputs.previousFrameInput()?.frame! + 1
    )
    assert.truthy(!isNaN(inputFrameWithDelay))

    return inputFrameWithDelay
  }

export const resetPrediction = (frame: Frame, queue: InputQueue) => {
  assert.truthy(queue.firstIncorrectFrame === NULL_FRAME || frame <= queue.firstIncorrectFrame)

  queue.prediction.frame = NULL_FRAME
  queue.firstIncorrectFrame = NULL_FRAME
  queue.lastRequestedFrame = NULL_FRAME
}

export const unsafeConfirmed =
  (requestedFrame: Frame) =>
  (queue: InputQueue): SerializedGameInput => {
    const maybeInput = queue.inputs.getFrameInput(requestedFrame)
    if (maybeInput?.frame === requestedFrame) {
      return maybeInput
    }

    throw "There is no confirmed input for the requested frame! This should not have been called! check sync layer"
  }

/*


-- HELPERS


*/

const wasPredicting = (queue: InputQueue) => notNullFrame(queue.prediction.frame)
const hasIncorrectFrame = (queue: InputQueue) => notNullFrame(queue.firstIncorrectFrame)
const noIncorrectFrame = (queue: InputQueue) => isNullFrame(queue.firstIncorrectFrame)
