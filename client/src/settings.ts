// -- GAME

export type GameSettings = {
  playerSpeed: number
  maxVelocityChange: number
}

export const defaultGameSettings = {
  playerSpeed: 10,
  maxVelocityChange: 1
}

// -- INPUT

export type InputSettings = {
  left: string
  right: string
  up: string
  down: string
  jump: string
}

export const defaultInputSettings: InputSettings = {
  left: "a",
  right: "d",
  up: "w",
  down: "s",
  jump: " "
}
