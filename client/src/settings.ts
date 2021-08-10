// -- GAME

export type GameSettings = {
  playerSpeed: number
  maxVelocityChange: number
}

export const defaultGameSettings = {
  playerSpeed: 2,
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
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  jump: " "
}
