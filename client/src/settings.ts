// -- GAME

export type GameSettings = {
  moveSpeed: number
  stepRate: number
}

export const defaultGameSettings = {
  moveSpeed: 3,
  stepRate: 60
}

export const slowGameSettings = { ...defaultGameSettings, stepRate: 1 }

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
