import { SavedStates } from "../gamestate/SavedStates"
import { either, nonEmptyArray } from "fp-ts"
import { Frame, RBRequest, NULL_FRAME, PlayerIndex, RBError } from "../types"
import { GameStateCell } from "../gamestate/GameStateCell"
import { assert } from "../assert"
import { gameInput, SerializedGameInput } from "../SerializedGameInput"
import { ConnectionStatus } from "../network/packet"
import { AllSettings } from "../defaults"
import { Either } from "fp-ts/Either"
import { InputQueue } from "../structs/InputQueue"
import * as inputQueue from "../structs/InputQueue"

// TODO does it make sense to do locking and such? how do you do it in js?
export class SyncLayer {
  settings: AllSettings
  numPlayers: number
  inputSize: number
  savedStates: SavedStates
  rollingBack: boolean
  lastConfirmedFrame: Frame
  currentFrame: Frame
  inputQueues: Array<[PlayerIndex, InputQueue]>

  constructor(settings: AllSettings, numPlayers: number, inputSize: number) {
    this.settings = settings
    const inputQueues = nonEmptyArray
      .range(0, numPlayers - 1)
      .map(
        playerIndex => [playerIndex, inputQueue.makeDefault(inputSize)] as [PlayerIndex, InputQueue]
      )

    this.numPlayers = numPlayers
    this.inputSize = inputSize
    this.savedStates = new SavedStates(this.settings)
    this.rollingBack = false
    this.lastConfirmedFrame = NULL_FRAME
    this.currentFrame = 0
    this.inputQueues = inputQueues
  }

  advanceFrame = () => {
    this.currentFrame++
  }

  saveCurrentState = (): RBRequest => {
    const cell = this.savedStates.push(this.currentFrame)
    return { _type: "saveGameState", cell: cell, frame: this.currentFrame }
  }

  resetPrediction = (frame: Frame) => {
    for (let i = 0; i < this.numPlayers; i++) {
      inputQueue.resetPrediction(frame, this.inputQueues[i][1])
    }
  }

  /// Loads the gamestate indicated by `frameToLoad`.
  // After execution, `this.savedStates.head` is set one position after the loaded state.
  loadFrame =
    (settings: AllSettings) =>
    (frameToLoad: Frame): RBRequest => {
      // The state should not be the current state or the state should not be in the future or too far away in the past
      assert.truthy(
        frameToLoad !== NULL_FRAME &&
          frameToLoad < this.currentFrame &&
          frameToLoad >= this.currentFrame - settings.MAX_PREDICTION_FRAMES
      )

      // Reset the head of the state ring-buffer to point in advance of the current frame (as if we had just finished executing it).
      const cell = this.savedStates.resetTo(frameToLoad)
      const loadedFrame = cell.gameState.frame
      assert.primitiveEqual(loadedFrame, frameToLoad)

      this.savedStates.head = (this.savedStates.head + 1) % settings.MAX_PREDICTION_FRAMES
      this.currentFrame = loadedFrame

      return { _type: "loadGameState", cell }
    }

  // Adds local input to the corresponding input queue. Checks if the prediction threshold has been reached. Returns the frame number where the input is actually added to.
  // This number will only be different if the input delay was set to a number higher than 0.
  addLocalInput =
    (settings: AllSettings) =>
    (
      frameDelay: number,
      playerIndex: PlayerIndex,
      input: SerializedGameInput
    ): Either<RBError, Frame> => {
      const framesAhead = this.currentFrame - this.lastConfirmedFrame
      if (framesAhead >= settings.MAX_PREDICTION_FRAMES) {
        return either.left({ _type: "predictionThreshold" })
      }

      assert.primitiveEqual(input.frame, this.currentFrame)
      return either.right(
        inputQueue.addInputWithFrameDelay(frameDelay, input)(this.inputQueues[playerIndex][1])
      )
    }

  // Adds remote input to the correspoinding input queue.
  // Unlike `add_local_input`, this will not check for correct conditions, as remote inputs have already been checked on another device.
  addRemoteInput = (frameDelay: number, playerIndex: PlayerIndex, input: SerializedGameInput) => {
    inputQueue.addInputWithFrameDelay(frameDelay, input, true)(this.inputQueues[playerIndex][1])
  }

  // Returns inputs for all players for the current frame of the sync layer.
  // If there are none for a specific player, return predictions.
  synchronizedInputs = (connectStatus: ConnectionStatus[]): SerializedGameInput[] =>
    connectStatus.map((conStatus, i) =>
      conStatus.disconnected
        ? gameInput.defaultForSettings(this.settings)
        : inputQueue.confirmedOrPredicted(this.currentFrame)(this.inputQueues[i][1])
    )

  // Returns confirmed inputs for all players for the current frame of the sync layer.
  confirmedInputs = (frame: Frame, connectStatus: ConnectionStatus[]): SerializedGameInput[] =>
    connectStatus.map((conStatus, i) =>
      conStatus.disconnected || conStatus.lastFrame < frame
        ? gameInput.defaultForSettings(this.settings)
        : inputQueue.unsafeConfirmed(this.currentFrame)(this.inputQueues[i][1])
    )

  // Sets the last confirmed frame to a given frame.
  // By raising the last confirmed frame, we can discard all previous frames,
  // as they are no longer necessary.
  setLastConfirmedFrame = (frame: Frame) => {
    let firstIncorrect = NULL_FRAME
    for (let i = 0; i < this.numPlayers; i++) {
      firstIncorrect = Math.max(firstIncorrect, this.inputQueues[i][1].firstIncorrectFrame)
    }

    // if we set the last confirmed frame beyond the first incorrect frame,
    // we discard inputs that we need later for adjusting the gamestate.
    assert.truthy(firstIncorrect === NULL_FRAME || firstIncorrect >= frame)

    this.lastConfirmedFrame = frame
    if (this.lastConfirmedFrame > 0) {
      for (let i = 0; i < this.numPlayers; i++) {
        // TODO! is this necessary?
        // this.inputQueues[i][1].discardConfirmedFrames(frame - 1)
      }
    }
  }

  checkSimulationConsistency = (firstIncorrect: Frame): Frame | undefined => {
    for (let i = 0; i < this.numPlayers; i++) {
      let incorrect = this.inputQueues[i][1].firstIncorrectFrame
      if (incorrect !== NULL_FRAME && (firstIncorrect === NULL_FRAME || incorrect < firstIncorrect))
        firstIncorrect = incorrect
    }

    return firstIncorrect === NULL_FRAME ? undefined : firstIncorrect
  }

  savedStateByFrame = (frame: Frame): GameStateCell | undefined => this.savedStates.byFrame(frame)
}
