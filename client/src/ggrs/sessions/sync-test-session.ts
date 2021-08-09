import { SyncLayer } from "../sync"
import { Frame, GGRSRequest, PlayerIndex } from "../lib"
import { either, nonEmptyArray } from "fp-ts"
import { Either } from "fp-ts/Either"
import { GGRSError } from "../error"
import { GameInput } from "../frame-info"
import * as assert from "assert"
import { ConnectionStatus } from "../network/packet"

export class SyncTestSession {
  numPlayers: number
  inputSize: number
  checkDistance: number
  syncLayer: SyncLayer
  dummyConnectStatus: Array<ConnectionStatus>
  checksumHistory: Map<Frame, number>

  constructor(numPlayers: number, inputSize: number, checkDistance: number) {
    const dummyConnectStatus = nonEmptyArray
      .range(0, numPlayers - 1)
      .map(playerIndex => new ConnectionStatus())

    this.numPlayers = numPlayers
    this.inputSize = inputSize
    this.checkDistance = checkDistance
    this.syncLayer = new SyncLayer(numPlayers, inputSize)
    this.dummyConnectStatus = dummyConnectStatus
    this.checksumHistory = new Map<Frame, number>()
  }

  /// In a sync test, this will advance the state by a single frame and afterwards rollback `check_distance` amount of frames,
  /// resimulate and compare checksums with the original states. Returns an order-sensitive `Vec<GGRSRequest>`.
  /// You should fulfill all requests in the exact order they are provided. Failure to do so will cause panics later.
  ///
  /// # Errors
  /// - Returns `InvalidHandle` if the provided player handle is higher than the number of players.
  /// - Returns `MismatchedChecksumError` if checksums don't match after resimulation.
  advanceFrame = (allInputs: Array<Uint8Array>): Either<GGRSError, Array<GGRSRequest>> => {
    const requests = new Array<GGRSRequest>()

    // if we advanced far enough into the game do comparisons and rollbacks
    if (this.checkDistance > 0 && this.syncLayer.currentFrame > this.checkDistance) {
      // compare checksums of older frames to our checksum history
      // (where only the first version of any checksum is allowed)
      for (let i = 0; i <= this.checkDistance; i++) {
        const frameToCheck = this.syncLayer.currentFrame - i
        if (!this.checksumsConsistent(frameToCheck)) {
          return either.left({ _type: "mismatchedChecksum", frame: frameToCheck })
        }
      }
      const frameTo = this.syncLayer.currentFrame - this.checkDistance
      this.adjustGameState(frameTo, requests)
    }

    // pass all inputs into the sync layer
    assert(this.numPlayers === allInputs.length)
    for (let playerIndex = 0; playerIndex < this.numPlayers; playerIndex++) {
      let input = new GameInput(this.syncLayer.currentFrame, this.inputSize)
      input.copyInput(allInputs[playerIndex])
      this.syncLayer.addLocalInput(playerIndex, input)
    }

    requests.push(this.syncLayer.saveCurrentState())

    const inputs = this.syncLayer.synchronizedInputs(this.dummyConnectStatus)
    inputs.forEach(input => assert(input.frame === this.syncLayer.currentFrame))
    requests.push({ _type: "advanceFrame", inputs: inputs })
    this.syncLayer.advanceFrame()

    // since this is a sync test, we "cheat" by setting the last confirmed state
    // to the (current state - check_distance),
    // so the sync layer won't complain about missing inputs from other players
    const safeFrame = this.syncLayer.currentFrame - this.checkDistance
    this.syncLayer.setLastConfirmedFrame(safeFrame)
    this.dummyConnectStatus.forEach(connStatus => {
      connStatus.lastFrame = this.syncLayer.currentFrame
    })

    return either.right(requests)
  }

  setFrameDelay = (newFrameDelay: number, playerIndex: PlayerIndex): Either<GGRSError, null> => {
    if (playerIndex > this.numPlayers) return either.left({ _type: "invalidHandle" })
    this.syncLayer.setFrameDelay(playerIndex, newFrameDelay)
    return either.right(null)
  }

  checksumsConsistent = (frameToCheck: Frame): boolean => {
    const oldestAllowedFrame = this.syncLayer.currentFrame - this.checkDistance

    for (const [frame, checksum] of this.checksumHistory.entries()) {
      if (frame >= oldestAllowedFrame) break
      this.checksumHistory.delete(frame)
    }

    const maybeCell = this.syncLayer.savedStateByFrame(frameToCheck)
    if (maybeCell) {
      const latestState = maybeCell.loadUnsafe()
      const maybeChecksum = this.checksumHistory.get(latestState.frame)
      if (maybeChecksum) {
        return maybeChecksum == latestState.checksum
      } else {
        this.checksumHistory.set(latestState.frame, latestState.checksum)
        return true
      }
    } else {
      return true
    }
  }

  adjustGameState = (frameTo: Frame, requests: GGRSRequest[]) => {
    const currentFrame = this.syncLayer.currentFrame
    const count = currentFrame - frameTo

    // rollback to the first incorrect state
    requests.push(this.syncLayer.loadFrame(frameTo))
    this.syncLayer.resetPrediction(frameTo)
    assert(this.syncLayer.currentFrame === frameTo)

    // step forward to the previous current state
    for (let i = 0; i < count; i++) {
      const inputs = this.syncLayer.synchronizedInputs(this.dummyConnectStatus)
      if (i > 0) {
        requests.push(this.syncLayer.saveCurrentState())
      }
      this.syncLayer.advanceFrame()
      requests.push({ _type: "advanceFrame", inputs })
    }

    assert(this.syncLayer.currentFrame === currentFrame)
  }
}
