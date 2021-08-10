import React, { useReducer, useRef, useState } from "react"
import { useKeyDown } from "./hooks/useKeyDown"
import { useInterval } from "./hooks/useInterval"
import { PlayerInputPreview } from "./PlayerInput"
import { defaultGameSettings, defaultInputSettings } from "./settings"
import * as game from "./game"
import { GameView } from "./GameView"
import { Rapier } from "./hooks/useRapier"

export const GameComponent = (props: { rapier: Rapier }) => {
  // TODO correct way of doing the render loop
  const [, forceRerender] = useReducer(x => x + 1, 0)

  const gameRef = useRef(game.init(props.rapier))
  const gameSettings = defaultGameSettings
  const inputSettings = defaultInputSettings

  const left = useKeyDown(inputSettings.left)
  const right = useKeyDown(inputSettings.right)
  const up = useKeyDown(inputSettings.up)
  const down = useKeyDown(inputSettings.down)
  const jump = useKeyDown(inputSettings.jump)

  useInterval(tick => {
    const [world, step, oneRb, twoRb] = gameRef.current
    step(
      gameSettings,
      world,
      oneRb,
      twoRb
    )({ left, right, up, down, jump }, { left, right, up, down, jump })

    forceRerender()
  }, 1000 / 60)

  return (
    <div>
      <PlayerInputPreview left={left} right={right} up={up} down={down} jump={jump} />
      <GameView game={gameRef.current} />
    </div>
  )
}
