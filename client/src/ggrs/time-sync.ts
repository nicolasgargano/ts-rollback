import { GameInput } from "./frame-info"
import { array, nonEmptyArray, number, semigroup } from "fp-ts"

const FRAME_WINDOW_SIZE = 30
const MIN_UNIQUE_FRAMES = 10
const MIN_FRAME_ADVANTAGE = 3
const MAX_FRAME_ADVANTAGE = 10

export class TimeSync {
  local: Array<number>
  remote: Array<number>
  lastInputs: Array<GameInput>

  constructor() {
    this.local = new Array(FRAME_WINDOW_SIZE).map(_ => 0)
    this.remote = new Array(FRAME_WINDOW_SIZE).map(_ => 0)
    this.lastInputs = nonEmptyArray.makeBy(i => new GameInput())(MIN_UNIQUE_FRAMES)
  }

  advanceFrame = (input: GameInput, localAdvantage: number, remoteAdvantage: number) => {
    this.lastInputs[input.frame % this.lastInputs.length] = input
    this.local[input.frame % this.local.length] = localAdvantage
    this.remote[input.frame % this.remote.length] = remoteAdvantage
  }

  recommendFrameDelay = (requireIdleInput: boolean): number => {
    const localSum = semigroup.concatAll<number>(number.SemigroupSum)(0)(this.local)
    const localAvg = localSum / this.local.length
    const remoteSum = semigroup.concatAll<number>(number.SemigroupSum)(0)(this.remote)
    const remoteAvg = remoteSum / this.remote.length

    // if we have the advantage, we are behind and don't need to wait.
    if (localAvg > remoteAvg) {
      return 0
    }

    // meet in the middle
    const sleepFrames = Math.floor((remoteAvg - localAvg) / 2 + 0.5)
    // only wait if discrepancy is big enough
    if (sleepFrames < MIN_FRAME_ADVANTAGE) {
      return 0
    }

    // if required, check if all past inputs are identical
    if (requireIdleInput) {
      const refInput = this.lastInputs[0]
      if (this.lastInputs.some(i => !i.equal(refInput, true))) {
        return 0
      }
    }

    return Math.min(sleepFrames, MAX_FRAME_ADVANTAGE)
  }
}
