import { ADT, match } from "ts-adt"
import { pipe } from "fp-ts/function"

export type GGRSError = ADT<{
  invalidHandle: {}
  predictionThreshold: {}
  invalidRequest: { info: string }
  mismatchedChecksum: { frame: number }
  socketCreationFailed: {}
  notSynchronized: {}
  playerDisconnected: {}
  spectatorTooFarBehind: {}
}>

export const errorToMsg = (error: GGRSError) =>
  pipe(
    error,
    match({
      invalidHandle: () => "The player handle you provided is invalid.",
      predictionThreshold: () =>
        "Prediction threshold is reached, cannot proceed without catching up.",
      invalidRequest: ({ info }) => `Invalid request: ${info}`,
      notSynchronized: () => "The session is not yet synchronized with all remote sessions.",
      mismatchedChecksum: ({ frame }) =>
        `Detected checksum mismatch during rollback on frame ${frame}.`,
      socketCreationFailed: () => `UPD Socket creation failed.`,
      playerDisconnected: () => `The player you are trying to disconnect is already disconnected.`,
      spectatorTooFarBehind: () =>
        "The spectator got so far behind the host that catching up is impossible."
    })
  )
