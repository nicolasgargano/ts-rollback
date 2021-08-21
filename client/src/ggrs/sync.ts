import { GameInput, GameState } from "./frame-info"
import {
  Frame,
  GGRSRequest,
  MAX_INPUT_BYTES,
  MAX_PLAYERS,
  MAX_PREDICTION_FRAMES,
  NULL_FRAME,
  PlayerIndex
} from "./lib"
import { InputQueue } from "./input-queue"
import { array, either, nonEmptyArray } from "fp-ts"
import { Either } from "fp-ts/Either"
import { GGRSError } from "./error"
import { ConnectionStatus } from "./network/packet"
import { assert } from "./assert"

// TODO does it make sense to do locking and such? how do you do it in js?
export class GameStateCell {
  gameState: GameState

  constructor(gameState: GameState) {
    this.gameState = gameState
  }

  static clone = (gameStateCell: GameStateCell): GameStateCell =>
    new GameStateCell(GameState.clone(gameStateCell.gameState))

  reset = (frame: Frame) => {
    this.gameState.frame = frame
    this.gameState.buffer = new Uint8Array(MAX_INPUT_BYTES * MAX_PLAYERS)
    this.gameState.checksum = 0
  }

  // Saves a `GameState` the user creates into the cell.
  save = (newState: GameState) => {
    assert(newState.buffer !== undefined)
    assert(this.gameState.frame === newState.frame)

    this.gameState.checksum = newState.checksum
    this.gameState.buffer = newState.buffer
  }

  loadUnsafe = (): GameState => {
    if (this.gameState.buffer !== undefined && this.gameState.frame !== NULL_FRAME) {
      return GameState.clone(this.gameState)
    } else {
      throw "Trying to load data that wasn't saved to."
    }
  }

  toString = () => `${this.gameState.frame}`
}

export class SavedStates {
  states: Array<GameStateCell>
  head: number

  constructor() {
    // the states array is two bigger than the max prediction frames
    // in order to account for the next frame needing a space
    // and still being able to rollback the max distance
    this.states = new Array<GameStateCell>(MAX_PREDICTION_FRAMES + 2)
    for (let i = 0; i < this.states.length; i++) {
      this.states[i] = GameStateCell.clone(
        new GameStateCell(GameState.clone(new GameState(NULL_FRAME, null, null)))
      )
    }
    this.head = 0
  }

  push = (frame: Frame): GameStateCell => {
    const savedState = this.states[this.head]
    savedState.reset(frame)
    this.head = (this.head + 1) % this.states.length
    assert(this.head < this.states.length)
    return savedState
  }

  findIndex = (frame: Frame): number | undefined => {
    const index = this.states.findIndex(cell => cell?.gameState?.frame === frame)
    return index !== -1 ? index : undefined
  }

  resetTo = (frame: Frame): GameStateCell => {
    const maybeIndex = this.findIndex(frame)
    if (maybeIndex !== undefined) {
      this.head = maybeIndex
      return this.states[this.head]
    }
    throw `[SavedStates:resetTo] Could not find saved frame index for frame: ${frame}`
  }

  byFrame = (frame: Frame): GameStateCell | undefined => {
    const maybeIndex = this.findIndex(frame)
    return maybeIndex ? this.states[maybeIndex] : undefined
  }
}

export class SyncLayer {
  numPlayers: number
  inputSize: number
  savedStates: SavedStates
  rollingBack: boolean
  lastConfirmedFrame: Frame
  currentFrame: Frame
  inputQueues: Array<InputQueue>

  constructor(numPlayers: number, inputSize: number) {
    const inputQueues = nonEmptyArray
      .range(0, numPlayers - 1)
      .map(playerIndex => new InputQueue(playerIndex, inputSize))

    this.numPlayers = numPlayers
    this.inputSize = inputSize
    this.savedStates = new SavedStates()
    this.rollingBack = false
    this.lastConfirmedFrame = NULL_FRAME
    this.currentFrame = 0
    this.inputQueues = inputQueues
  }

  advanceFrame = () => {
    this.currentFrame++
  }

  saveCurrentState = (): GGRSRequest => {
    const cell = this.savedStates.push(this.currentFrame)
    return { _type: "saveGameState", cell: cell, frame: this.currentFrame }
  }

  setFrameDelay = (playerIndex: PlayerIndex, delay: number) => {
    assert(playerIndex < this.numPlayers)
    this.inputQueues[playerIndex].frameDelay = delay
  }

  resetPrediction = (frame: Frame) => {
    for (let i = 0; i < this.numPlayers; i++) {
      this.inputQueues[i].resetPrediction(frame)
    }
  }

  /// Loads the gamestate indicated by `frameToLoad`.
  // After execution, `this.savedStates.head` is set one position after the loaded state.
  loadFrame = (frameToLoad: Frame): GGRSRequest => {
    // The state should not be the current state or the state should not be in the future or too far away in the past
    assert(
      frameToLoad !== NULL_FRAME &&
        frameToLoad < this.currentFrame &&
        frameToLoad >= this.currentFrame - MAX_PREDICTION_FRAMES
    )

    // Reset the head of the state ring-buffer to point in advance of the current frame (as if we had just finished executing it).
    const cell = this.savedStates.resetTo(frameToLoad)
    const loadedFrame = cell.gameState.frame
    assert(loadedFrame === frameToLoad)

    this.savedStates.head = (this.savedStates.head + 1) % MAX_PREDICTION_FRAMES
    this.currentFrame = loadedFrame

    return { _type: "loadGameState", cell }
  }

  // Adds local input to the corresponding input queue. Checks if the prediction threshold has been reached. Returns the frame number where the input is actually added to.
  // This number will only be different if the input delay was set to a number higher than 0.
  addLocalInput = (playerIndex: PlayerIndex, input: GameInput): Either<GGRSError, Frame> => {
    const framesAhead = this.currentFrame - this.lastConfirmedFrame
    if (framesAhead >= MAX_PREDICTION_FRAMES) {
      return either.left({ _type: "predictionThreshold" })
    }

    assert(input.frame === this.currentFrame)
    return either.right(this.inputQueues[playerIndex].addInputWithFrameDelay(input))
  }

  // Adds remote input to the correspoinding input queue.
  // Unlike `add_local_input`, this will not check for correct conditions, as remote inputs have already been checked on another device.
  addRemoteInput = (playerIndex: PlayerIndex, input: GameInput) => {
    this.inputQueues[playerIndex].addInputWithFrameDelay(input)
  }

  // Returns inputs for all players for the current frame of the sync layer.
  // If there are none for a specific player, return predictions.
  synchronizedInputs = (connectStatus: ConnectionStatus[]): GameInput[] =>
    connectStatus.map((conStatus, i) =>
      conStatus.disconnected
        ? new GameInput()
        : this.inputQueues[i].inputOrPredict(this.currentFrame)
    )

  // Returns confirmed inputs for all players for the current frame of the sync layer.
  confirmedInputs = (frame: Frame, connectStatus: ConnectionStatus[]): GameInput[] =>
    connectStatus.map((conStatus, i) =>
      conStatus.disconnected || conStatus.lastFrame < frame
        ? new GameInput()
        : this.inputQueues[i].inputOrPredict(this.currentFrame)
    )

  // Sets the last confirmed frame to a given frame.
  // By raising the last confirmed frame, we can discard all previous frames,
  // as they are no longer necessary.
  setLastConfirmedFrame = (frame: Frame) => {
    let firstIncorrect = NULL_FRAME
    for (let i = 0; i < this.numPlayers; i++) {
      firstIncorrect = Math.max(firstIncorrect, this.inputQueues[i].firstIncorrectFrame)
    }

    // if we set the last confirmed frame beyond the first incorrect frame,
    // we discard inputs that we need later for adjusting the gamestate.
    assert(firstIncorrect === NULL_FRAME || firstIncorrect >= frame)

    this.lastConfirmedFrame = frame
    if (this.lastConfirmedFrame > 0) {
      for (let i = 0; i < this.numPlayers; i++) {
        this.inputQueues[i].discardConfirmedFrames(frame - 1)
      }
    }
  }

  checkSimulationConsistency = (firstIncorrect: Frame): Frame | undefined => {
    for (let i = 0; i < this.numPlayers; i++) {
      let incorrect = this.inputQueues[i].firstIncorrectFrame
      if (incorrect !== NULL_FRAME && (firstIncorrect === NULL_FRAME || incorrect < firstIncorrect))
        firstIncorrect = incorrect
    }

    return firstIncorrect === NULL_FRAME ? undefined : firstIncorrect
  }

  savedStateByFrame = (frame: Frame): GameStateCell | undefined => this.savedStates.byFrame(frame)
}
