import { GameState } from "./GameState"
import { GameStateCell } from "./GameStateCell"
import { AllSettings } from "../defaults"
import { Frame, NULL_FRAME } from "../types"
import { assert } from "../assert"

export class SavedStates {
  settings: AllSettings
  states: Array<GameStateCell>
  head: number

  constructor(settings: AllSettings) {
    this.settings = settings
    // the states array is two bigger than the max prediction frames
    // in order to account for the next frame needing a space
    // and still being able to rollback the max distance
    this.states = new Array<GameStateCell>(this.settings.MAX_PREDICTION_FRAMES + 2)
    for (let i = 0; i < this.states.length; i++) {
      this.states[i] = GameStateCell.clone(settings)(
        new GameStateCell(settings, GameState.clone(new GameState(NULL_FRAME, null, null)))
      )
    }
    this.head = 0
  }

  push = (frame: Frame): GameStateCell => {
    const savedState = this.states[this.head]
    savedState.reset(frame)
    this.head = (this.head + 1) % this.states.length
    assert.truthy(this.head < this.states.length)
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
