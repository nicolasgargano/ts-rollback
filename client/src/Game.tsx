import React, { useState } from "react"
import { FrameData, initialGameState, noPlayerInput } from "./data"
import { useKeyDown } from "./hooks/useKeyDown"
import { useInterval } from "./hooks/useInterval"
import { PlayerInputPreview } from "./PlayerInput"
import { GameStateDebug } from "./GameStateDebug"
import { GameView } from "./GameView"
import { defaultInputSettings, slowGameSettings } from "./settings"
import { stepGame } from "./step"

export const Game = () => {
  const [gameState, setGameState] = useState(initialGameState)
  const [gameSettings, setGameSettings] = useState(slowGameSettings)
  const [inputSettings] = useState(defaultInputSettings)
  const left = useKeyDown(inputSettings.left)
  const right = useKeyDown(inputSettings.right)
  const up = useKeyDown(inputSettings.up)
  const down = useKeyDown(inputSettings.down)
  const jump = useKeyDown(inputSettings.jump)

  useInterval(tick => {
    console.log("Tick")
    const frameData: FrameData = {
      frame: tick,
      oneInput: {
        left,
        right,
        up,
        down,
        jump
      },
      twoInput: noPlayerInput
    }
    setGameState(gm => stepGame(gameSettings)(frameData, gm))
  }, 1000 / gameSettings.stepRate)

  const StepRateConrol = () => (
    <div style={{ display: "flex" }}>
      <button onClick={() => setGameSettings(gs => ({ ...gs, stepRate: gs.stepRate - 1 }))}>
        slower
      </button>
      <p>Steps per second: {gameSettings.stepRate}</p>
      <button onClick={() => setGameSettings(gs => ({ ...gs, stepRate: gs.stepRate + 1 }))}>
        faster
      </button>
    </div>
  )

  return (
    <div>
      <PlayerInputPreview left={left} right={right} up={up} down={down} jump={jump} />
      <GameStateDebug gameState={gameState} />
      <StepRateConrol />
      <GameView gameState={gameState} />
    </div>
  )
}
