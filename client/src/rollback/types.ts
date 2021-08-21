import { ADT, match } from "ts-adt"
import { GameStateCell } from "../ggrs/sync"
import { pipe } from "fp-ts/function"
import { SerializedGameInput } from "./SerializedGameInput"

export type Frame = number

export const isNullFrame = (frame: Frame): boolean => frame === NULL_FRAME
export const notNullFrame = (frame: Frame): boolean => frame !== NULL_FRAME

export type PlayerIndex = number

export const NULL_FRAME: Frame = -1

// -- UNIONS

/*
Defines the three types of players to consider:
  - local players, who play on the local device,
  - remote players, who play on other devices and
  - spectators, who are remote players that do not contribute to the game input.
Both `Remote` and `Spectator` have a socket address associated with them.
 */
export type PlayerType = ADT<{
  local: {}
  remote: { peerId: string }
  spectator: { peerId: string }
}>

export enum SessionState {
  Initializing,
  Synchronizing,
  Running
}

export type RBEvent = ADT<{
  synchronizing: { playerHandle: PlayerIndex; total: number; count: number }
  synchronized: { playerHandle: PlayerIndex }
  disconnected: { playerHandle: PlayerIndex }
  networkInterrupted: { playerHandle: PlayerIndex; disconnectTimeout: number }
  networkResumed: { playerHandle: PlayerIndex }
  waitRecommendation: { skipFrames: number }
}>

export type RBRequest = ADT<{
  saveGameState: { cell: GameStateCell; frame: Frame }
  loadGameState: { cell: GameStateCell }
  advanceFrame: { inputs: SerializedGameInput[] }
}>

export type RBError = ADT<{
  invalidHandle: {}
  predictionThreshold: {}
  invalidRequest: { info: string }
  mismatchedChecksum: { frame: number }
  socketCreationFailed: {}
  notSynchronized: {}
  playerDisconnected: {}
  spectatorTooFarBehind: {}
}>

export const errorToMsg = (error: RBError) =>
  pipe(
    error,
    match({
      invalidHandle: () => "The player handle you provided is invalid.",
      predictionThreshold: () =>
        "Prediction threshold is reached, cannot proceed without catching up.",
      invalidRequest: ({ info }) => `Invalid request: ${info}`,
      notSynchronized: () => "The session is not yet synchronized with all remote peerjs-session.",
      mismatchedChecksum: ({ frame }) =>
        `Detected checksum mismatch during rollback on frame ${frame}.`,
      socketCreationFailed: () => `UPD Socket creation failed.`,
      playerDisconnected: () => `The player you are trying to disconnect is already disconnected.`,
      spectatorTooFarBehind: () =>
        "The spectator got so far behind the host that catching up is impossible."
    })
  )
