import { FrameData, GameState } from "./data"
import { GameSettings } from "./settings"

export const stepGame =
  (gameSettings: GameSettings) =>
  (frameData: FrameData, gameState: GameState): GameState => {
    console.log("Step")
    console.log(frameData)

    const { moveSpeed, stepRate } = gameSettings
    const { one, two } = gameState
    const { oneInput, twoInput } = frameData

    const newOne = {
      ...one,
      x: oneInput.right
        ? one.x + gameSettings.moveSpeed / gameSettings.stepRate
        : oneInput.left
        ? one.x - gameSettings.moveSpeed / gameSettings.stepRate
        : one.x
    }

    const newGameSate = { ...gameState, one: newOne }

    return newGameSate
  }
