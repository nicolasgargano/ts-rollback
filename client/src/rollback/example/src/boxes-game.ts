import Peer from "peerjs"
import { pipe } from "fp-ts/function"
import * as either from "fp-ts/Either"
import { match } from "ts-adt"
import { PeerJsSession } from "../../peerjs-session/peerjs-session"

export type GameSettings = {
  speed: number
}

export const defaultGameSettings = {
  speed: 10
}

export type GameState = {
  step: number
  one: {
    x: number
    y: number
  }
  two: {
    x: number
    y: number
  }
}

export type Input = {
  up: boolean
  right: boolean
  down: boolean
  left: boolean
}

export const initialGameState: GameState = {
  step: 0,
  one: {
    x: -3,
    y: 0
  },
  two: {
    x: 3,
    y: 0
  }
}

export const step = (settings: GameSettings, state: GameState) => (oneIn: Input, twoIn: Input) => {
  const speedPerFrame = settings.speed / 60

  state.one.x += oneIn.right ? speedPerFrame : 0
  state.one.x += oneIn.left ? -speedPerFrame : 0
  state.one.y += oneIn.up ? speedPerFrame : 0
  state.one.y += oneIn.down ? -speedPerFrame : 0

  state.two.x += twoIn.right ? speedPerFrame : 0
  state.two.x += twoIn.left ? -speedPerFrame : 0
  state.two.y += twoIn.up ? speedPerFrame : 0
  state.two.y += twoIn.down ? -speedPerFrame : 0

  state.step++
}
