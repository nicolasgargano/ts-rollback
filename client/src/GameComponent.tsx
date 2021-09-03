import React, { useReducer, useRef, useState } from "react"
import { useKeyDown } from "./hooks/useKeyDown"
import { useInterval } from "./hooks/useInterval"
import { defaultGameSettings, defaultInputSettings } from "./settings"
import * as game from "./game"
import { GameViewDebug } from "./GameViewDebug"
import { Rapier } from "./hooks/useRapier"
import { Canvas } from "@react-three/fiber"
import { Ray, RayColliderToi } from "@dimforge/rapier2d-compat"

export const GameComponent = (props: { rapier: Rapier }) => {
  // TODO correct way of doing the render loop
  const [, forceRerender] = useReducer(x => x + 1, 0)

  const [gameRef] = useState(() => game.init(props.rapier))

  const [pause, setPause] = useState(false)

  const gameSettings = defaultGameSettings
  const inputSettings = defaultInputSettings

  const left = useKeyDown(inputSettings.left)
  const right = useKeyDown(inputSettings.right)
  const up = useKeyDown(inputSettings.up)
  const down = useKeyDown(inputSettings.down)
  const jump = useKeyDown(inputSettings.jump)

  const twoleft = useKeyDown("ArrowLeft")
  const tworight = useKeyDown("ArrowRight")
  const twoup = useKeyDown("ArrowUp")
  const twodown = useKeyDown("ArrowDown")
  const twojump = useKeyDown("ArrowUp")

  useInterval(tick => {
    if (pause) {
      return
    }
    const gameState = gameRef
    game.step(gameSettings, gameState)(
      { left, right, up, down, jump },
      { left: twoleft, right: tworight, up: twoup, down: twodown, jump: twojump }
    )

    forceRerender()
  }, 1000 / 60)

  return (
    <>
      <button onClick={() => setPause(!pause)}>{pause ? "Play" : "Pause"}</button>
      <GameViewDebug gamestate={gameRef} />
    </>
  )
}
