import { Frame, NULL_FRAME, PlayerIndex } from "./lib"
import { GameInput } from "./frame-info"
import { array, nonEmptyArray } from "fp-ts"
import { assert } from "./assert"

// The length of the input queue. This describes the number of inputs GGRS can hold at the same time per player.
export const INPUT_QUEUE_LENGTH = 128

// `InputQueue` handles inputs for a single player and saves them in a circular array. Valid Inputs are between `head` and `tail`.
export class InputQueue {
  // Identifies the player this InputQueue belongs to
  id: PlayerIndex
  // The head of the queue. The newest `GameInput` is saved here
  head: number
  // The tail of the queue. The oldest `GameInput` still valid is saved here.
  tail: number
  // The current length of the queue.
  length: number
  // Denotes if we still are in the first frame, an edge case to be considered by some methods.
  firstFrame: boolean

  // The last frame added by the user
  lastAddedFrame: Frame
  // The first frame in the queue that is known to be an incorrect prediction
  private _firstIncorrectFrame: Frame
  // The last frame that has been requested. We make sure to never delete anything after this, as we would throw away important data.
  lastRequestedFrame: Frame

  // The delay in frames by which inputs are sent back to the user. This can be set during initialization.
  private _frameDelay: number
  // Our cyclic input queue
  inputs: GameInput[]

  // A pre-allocated prediction we are going to use to return predictions from.
  prediction: GameInput

  constructor(id: PlayerIndex, inputSize: number) {
    this.id = id
    this.head = 0
    this.tail = 0
    this.length = 0

    this._frameDelay = 0
    this.firstFrame = true
    this.lastAddedFrame = NULL_FRAME
    this._firstIncorrectFrame = NULL_FRAME
    this.lastRequestedFrame = NULL_FRAME

    this.inputs = new Array<GameInput>(INPUT_QUEUE_LENGTH)
    for (let i = 0; i < this.inputs.length; i++) {
      this.inputs[i] = new GameInput(NULL_FRAME, inputSize)
    }

    this.prediction = new GameInput(NULL_FRAME, inputSize)
  }

  get firstIncorrectFrame(): Frame {
    return this._firstIncorrectFrame
  }

  set frameDelay(newDelay: number) {
    this._frameDelay = newDelay
  }
  get frameDelay() {
    return this._frameDelay
  }

  resetPrediction = (frame: Frame) => {
    assert(this.firstIncorrectFrame === NULL_FRAME || frame <= this.firstIncorrectFrame)

    this.prediction.frame = NULL_FRAME
    this._firstIncorrectFrame = NULL_FRAME
    this.lastRequestedFrame = NULL_FRAME
  }

  // Returns a `GameInput`, but only if the input for the requested frame is confirmed.
  // In contrast to `input()`, this will not return a prediction if there is no confirmed input for the frame, but throw instead.
  unsafeConfirmedInput = (requestedFrame: Frame): GameInput => {
    const ringPosition = requestedFrame % INPUT_QUEUE_LENGTH

    if (this.inputs[ringPosition].frame === requestedFrame) {
      return this.inputs[ringPosition]
    }

    throw "[InputQueue:confirmed_input()]: There is no confirmed input for the requested frame. The requested confirmed input should not be before a prediction."
  }

  // Discards confirmed frames up to given `frame` from the queue. All confirmed frames are guaranteed to be synchronized between players, so there is no need to save the inputs anymore.
  discardConfirmedFrames = (frame: Frame) => {
    // We only drop frames until the last frame that was requested, otherwise we might delete data still needed.

    if (this.lastRequestedFrame !== NULL_FRAME) {
    }

    const deleteUpToFrame =
      this.lastRequestedFrame !== NULL_FRAME ? Math.min(frame, this.lastRequestedFrame) : frame

    // move the tail to "delete inputs", wrap around if necessary
    if (deleteUpToFrame >= this.lastAddedFrame) {
      // delete all but most recent
      this.tail = this.head
      this.length = 1
    } else if (deleteUpToFrame <= this.inputs[this.tail].frame) {
      // we don't need to delete anything
    } else {
      const fromTailToDeleteTarget = deleteUpToFrame - this.inputs[this.tail].frame
      this.tail = (this.tail + fromTailToDeleteTarget) % INPUT_QUEUE_LENGTH
      this.length = this.length - fromTailToDeleteTarget
    }
  }

  // Returns the game input of a single player for a given frame,
  // if that input does not exist, we return a prediction instead.
  inputOrPredict = (requestedFrame: Frame) => {
    // No one should ever try to grab any input when we have a prediction error.
    // Doing so means that we're just going further down the wrong path.
    // Assert this to verify that it's true.
    assert(this.firstIncorrectFrame === NULL_FRAME)

    // Remember the last requested frame number for later.
    // We'll need this in addInputWithDelay() to drop out of prediction mode.
    this.lastRequestedFrame = requestedFrame

    // Assert that we request a frame that still exists
    const tailFrame = this.inputs[this.tail].frame
    assert(requestedFrame >= tailFrame)

    // We currently don't have a prediction frame
    if (this.prediction.frame < 0) {
      const tailToRequested = requestedFrame - tailFrame

      //  If the frame requested is in our range,
      //  fetch it out of the queue and return it.
      if (tailToRequested < this.length) {
        const requestedFramePosition = (tailToRequested + this.tail) % INPUT_QUEUE_LENGTH // Wrap around ring if necessary
        assert(this.inputs[requestedFramePosition].frame === requestedFrame)
        return this.inputs[requestedFramePosition]
      }

      // If we are here, it means the requested frame isn't in the queue.
      // This means we need to return a prediction frame.
      // Predict that the user will do the same thing they did last time.

      // If this is the first frame, we have no prediction.
      if (requestedFrame == 0 || this.lastRequestedFrame == NULL_FRAME) {
        // Basing new prediction frame from nothing, since we are on frame 0 or we have no frames yet
        this.prediction.eraseBits()
      } else {
        // Basing new prediction frame from previously added frame
        const previousPosition = this.head === 0 ? INPUT_QUEUE_LENGTH - 1 : this.head - 1
        this.prediction = this.inputs[previousPosition]
      }
      this.prediction.frame += 1
    }

    // We must be predicting, so we return the prediction frame contents.
    // We are adjusting the prediction to have the requested frame.
    assert(this.prediction.frame !== NULL_FRAME)
    const predictionToReturn = GameInput.clone(this.prediction)
    predictionToReturn.frame = requestedFrame
    return predictionToReturn
  }

  // Adds an input frame to the queue.
  // Will consider the set frame delay.
  addInputWithFrameDelay = (input: GameInput): Frame => {
    assert(
      this.lastAddedFrame === NULL_FRAME ||
        input.frame + this.frameDelay === this.lastAddedFrame + 1,
      `Verify that inputs are passed in sequentially by the user, regardless of frame delay. 
input.frame + this.frameDelay === this.lastAddedFrame + 1
this.frameDelay = ${this.frameDelay}
this.lastAddedFrame = ${this.lastAddedFrame}
input.frame = ${input.frame}`
    )

    const newFrame = this.advanceQueueHead(input.frame)

    if (newFrame !== NULL_FRAME) {
      if (this.id === 1) console.debug(`before add head: ${this.head}`)
      this.addInputByFrame(input, newFrame)
      if (this.id === 1)
        console.debug(
          `[ queue (${this.id})] newFrame from advanceQueueHead(${input.frame}) ${this.id}: ${newFrame}, head: ${this.head}, after add:`,
          this.inputs.slice(0, 11)
        )
    }
    return newFrame
  }

  // Adds an input frame to the queue at the given frame number.
  // If there are predicted inputs,
  //   we will check those and mark them as incorrect,
  //   if necessary.
  // Returns the frame number
  addInputByFrame = (input: GameInput, frame: Frame) => {
    const previousPosition = this.head === 0 ? INPUT_QUEUE_LENGTH - 1 : this.head - 1

    assert(input.size === this.prediction.size)
    assert(this.lastAddedFrame === NULL_FRAME || frame === this.lastAddedFrame + 1)
    assert(frame === 0 || this.inputs[previousPosition].frame === frame - 1)

    // Add the frame to the back of the queue
    this.inputs[this.head] = GameInput.clone(input)
    this.inputs[this.head].frame = frame
    this.head = (this.head + 1) % INPUT_QUEUE_LENGTH
    // if (this.id === 1) {
    //   console.debug(`[queue] setting head = ${(this.head + 1) % INPUT_QUEUE_LENGTH}`)
    // }
    this.head = (this.head + 1) % INPUT_QUEUE_LENGTH
    this.length += 1

    assert(this.length <= INPUT_QUEUE_LENGTH)

    this.firstFrame = false
    // if (this.id === 1) console.debug(`[ queue (${this.id}) ] Setting lastAddedFrame to ${frame}`)
    this.lastAddedFrame = frame

    // We may have been predicting.
    // See if the inputs we've gotten match what we've been predicting.
    // If so, don't worry about it.
    if (this.prediction.frame !== NULL_FRAME) {
      assert(frame === this.prediction.frame)

      // Remember the first input which was incorrect so we can report it.
      if (this.firstIncorrectFrame === NULL_FRAME && !this.prediction.equal(input, true)) {
        this._firstIncorrectFrame = frame
      }

      // If this input is the same frame as the last one requested
      // and we still haven't found any mispredicted inputs, we can exit predition mode.
      // Otherwise, advance the prediction frame count up.
      if (
        this.prediction.frame == this.lastRequestedFrame &&
        this.firstIncorrectFrame === NULL_FRAME
      ) {
        this.prediction.frame = NULL_FRAME
      } else {
        this.prediction.frame += 1
      }
    }
  }

  advanceQueueHead = (inputFrame: Frame): Frame => {
    let previousPosition = this.head === 0 ? INPUT_QUEUE_LENGTH - 1 : this.head - 1

    let expectedFrame = this.firstFrame ? 0 : this.inputs[previousPosition].frame + 1

    const inputFrameWithDelay = inputFrame + this.frameDelay

    if (this.id == 1)
      console.debug(
        `[ queue (${this.id}) ] head: ${this.head}, inputs before adv q h ${inputFrame}:`,
        this.inputs.slice(0, 11)
      )
    //  This can occur when the frame delay has dropped since
    //    the last time we shoved a frame into the system.
    //  In this case, there's no room on the queue. Toss it.
    if (expectedFrame > inputFrameWithDelay) {
      return NULL_FRAME
    }

    //   This can occur when the frame delay has been increased since
    // the last time we shoved a frame into the system.
    //   We need to replicate the last frame in the queue several times
    // in order to fill the space left.

    while (expectedFrame < inputFrameWithDelay) {
      const replicatedInputToAdd = GameInput.clone(this.inputs[previousPosition])
      this.addInputByFrame(replicatedInputToAdd, expectedFrame)
      expectedFrame++
    }

    previousPosition = this.head === 0 ? INPUT_QUEUE_LENGTH - 1 : this.head - 1

    assert(inputFrame === 0 || inputFrameWithDelay === this.inputs[previousPosition].frame + 1)
    assert(!isNaN(inputFrameWithDelay))

    if (this.id == 1)
      console.debug(
        `[ queue (${this.id}) ] inputs after adv q h ${inputFrame}, head: ${this.head}, newFrame ${inputFrameWithDelay}:`,
        this.inputs.slice(0, 11)
      )

    return inputFrameWithDelay
  }
}
