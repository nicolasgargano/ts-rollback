import { nonEmptyArray, number, semigroup } from "fp-ts"
import { NULL_FRAME } from "../types"
import { SerializedGameInput } from "../SerializedGameInput"

/*


-- STRUCTURE


 */

export type TimeSyncSettings = {
  FRAME_WINDOW_SIZE: number
  MIN_UNIQUE_FRAMES: number
  MIN_FRAME_ADVANTAGE: number
  MAX_FRAME_ADVANTAGE: number
}

export type TimeSyncData = {
  local: Array<number>
  remote: Array<number>
  lastInputs: Array<SerializedGameInput>
}

/*


-- CONSTRUCTORS


 */

const make = (settings: TimeSyncSettings): TimeSyncData => ({
  local: nonEmptyArray.makeBy(_ => 0)(settings.FRAME_WINDOW_SIZE),
  remote: nonEmptyArray.makeBy(_ => 0)(settings.FRAME_WINDOW_SIZE),
  lastInputs: nonEmptyArray.makeBy(i => new SerializedGameInput(NULL_FRAME, 0, new Uint8Array(0)))(
    settings.MIN_UNIQUE_FRAMES
  )
})

/*


-- OPERATIONS


 */

const advanceFrame =
  (input: SerializedGameInput, localAdvantage: number, remoteAdvantage: number) =>
  (sync: TimeSyncData, settings: TimeSyncSettings) => {
    sync.local[input.frame % sync.local.length] = localAdvantage
    sync.remote[input.frame % sync.remote.length] = remoteAdvantage
    sync.lastInputs[input.frame % sync.lastInputs.length] = input
  }

const recommendFrameDelay =
  (requireIdleInput: boolean) =>
  (sync: TimeSyncData, settings: TimeSyncSettings): number => {
    const localSum = semigroup.concatAll<number>(number.SemigroupSum)(0)(sync.local)
    const localAvg = localSum / sync.local.length
    const remoteSum = semigroup.concatAll<number>(number.SemigroupSum)(0)(sync.remote)
    const remoteAvg = remoteSum / sync.remote.length

    // if we have the advantage, we are behind and don't need to wait.
    if (localAvg > remoteAvg) {
      return 0
    }

    // meet in the middle
    const sleepFrames = Math.floor((remoteAvg - localAvg) / 2 + 0.5)
    // only wait if discrepancy is big enough
    if (sleepFrames < settings.MIN_FRAME_ADVANTAGE) {
      return 0
    }

    // if required, check if all past inputs are identical
    if (requireIdleInput) {
      const refInput = sync.lastInputs[0]
      if (sync.lastInputs.some(i => !SerializedGameInput.equals(i, refInput, true))) {
        return 0
      }
    }

    return Math.min(sleepFrames, settings.MAX_FRAME_ADVANTAGE)
  }

/*


--MODULE

  
*/

export const timeSync = {
  make,
  advanceFrame,
  recommendFrameDelay
}
