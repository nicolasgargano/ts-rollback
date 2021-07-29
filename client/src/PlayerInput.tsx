import React from "react"
import { PlayerInput } from "./data"

export const PlayerInputPreview = (playerInput: PlayerInput) => (
  <div>
    <pre>{JSON.stringify(playerInput, null, 2)}</pre>
  </div>
)
