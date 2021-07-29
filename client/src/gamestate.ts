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

export type InputSettings = {
  left: string
  right: string
  up: string
  down: string
  jump: string
}

export const defaultInputSettings = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  jump: " "
}

export const noPlayerInput: PlayerInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false
}

export type GameSettings = {
  moveSpeed: number
  stepRate: number
}

export const defaultGameSettings = {
  moveSpeed: 3,
  stepRate: 60
}

export const slowGameSettings = { ...defaultGameSettings, stepRate: 1 }

export const gameStep =
  (gameSettings: GameSettings) =>
  (frameData: FrameData, gameState: GameState): GameState => {
    console.log("Step")
    console.log(frameData)

    const { moveSpeed, stepRate } = gameSettings
    const { one, two } = gameState
    const { oneInput, twoInput } = frameData

    const newOne = {
      ...one,
      x: oneInput.right
        ? one.x + gameSettings.moveSpeed / gameSettings.stepRate
        : oneInput.left
        ? one.x - gameSettings.moveSpeed / gameSettings.stepRate
        : one.x
    }

    const newGameSate = { ...gameState, one: newOne }

    return newGameSate
  }
