import React, { useEffect } from "react"
import { Connection } from "./Connection"
import { Game } from "./Game"

export const App = () => {
  return (
    <div>
      <Connection />
      <Game />
    </div>
  )
}
