import { GameState } from "./GameState"
import { Frame, NULL_FRAME } from "../types"
import { AllSettings } from "../defaults"
import { assert } from "../assert"

export class GameStateCell {
  settings: AllSettings
  gameState: GameState

  constructor(settings: AllSettings, gameState: GameState) {
    this.gameState = gameState
    this.settings = settings
  }

  static clone =
    (settings: AllSettings) =>
    (gameStateCell: GameStateCell): GameStateCell =>
      new GameStateCell(settings, GameState.clone(gameStateCell.gameState))

  reset = (frame: Frame) => {
    this.gameState.frame = frame
    this.gameState.buffer = new Uint8Array(
      this.settings.MAX_INPUT_BYTES * this.settings.MAX_PLAYERS
    )
    this.gameState.checksum = 0
  }

  // Saves a `GameState` the user creates into the cell.
  save = (newState: GameState) => {
    assert.defined(newState.buffer)
    assert.primitiveEqual(this.gameState.frame, newState.frame)

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
