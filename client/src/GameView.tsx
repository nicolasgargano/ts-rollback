import React from "react"
import { GameState } from "./gamestate"

export const GameView = (props: { gameState: GameState }) => (
  <div>
    <p>One position: {props.gameState.one.x}</p>
  </div>
)
