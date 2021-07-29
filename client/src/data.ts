export type GameState = {
  one: Player
  two: Player
}

export type Player = {
  name: string
  x: number
  y: number
  rotation: number
}

export type FrameData = {
  frame: number
  oneInput: PlayerInput
  twoInput: PlayerInput
}

export type PlayerInput = {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  jump: boolean
}

export const initialGameState: GameState = {
  one: {
    name: "One",
    x: -8,
    y: 0.5,
    rotation: 0
  },
  two: {
    name: "Two",
    x: 8,
    y: 0.5,
    rotation: 0
  }
}

export const noPlayerInput: PlayerInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false
}
