import React from "react"
import { GameState } from "./data"

export const GameStateDebug = (props: { gameState: GameState }) => (
  <div>
    <pre>{JSON.stringify(props.gameState, null, 2)}</pre>
  </div>
)
