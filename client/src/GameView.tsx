import React from "react"
import { GameState } from "./data"

export const GameView = (props: { gameState: GameState }) => (
  <div>
    <p>One position: {props.gameState.one.x}</p>
  </div>
)
