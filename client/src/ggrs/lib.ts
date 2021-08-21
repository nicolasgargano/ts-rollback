import { ADT } from "ts-adt"
import { DataConnection } from "peerjs"
import { GameInput } from "./frame-info"
import { GameStateCell } from "./sync"
import { GGRSError } from "./error"
import { SyncTestSession } from "./sessions/sync-test-session"
import { Either } from "fp-ts/Either"
import { either } from "fp-ts"
import { PeerJsProtocol } from "./network/peerjs-protocol"

// -- CONSTANTS

export const MAX_PLAYERS = 4
export const MAX_PREDICTION_FRAMES = 16
export const MAX_INPUT_BYTES = 8
export const NULL_FRAME = -1

export type Frame = number
export type PlayerIndex = number
export const SPECTATOR_PLAYER_INDEX_FROM = 1000

// -- UNIONS

/*
Defines the three types of players that GGRS considers:
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

export type GGRSEvent = ADT<{
  synchronizing: { playerHandle: PlayerIndex; total: number; count: number }
  synchronized: { playerHandle: PlayerIndex }
  disconnected: { playerHandle: PlayerIndex }
  networkInterrupted: { playerHandle: PlayerIndex; disconnectTimeout: number }
  networkResumed: { playerHandle: PlayerIndex }
  waitRecommendation: { skipFrames: number }
}>

export type GGRSRequest = ADT<{
  saveGameState: { cell: GameStateCell; frame: Frame }
  loadGameState: { cell: GameStateCell }
  advanceFrame: { inputs: GameInput[] }
}>

// -- FUNCTIONS

/// Used to create a new `SyncTestSession`. During a sync test, GGRS will simulate a rollback every frame and resimulate the last n states, where n is the given `check_distance`.
/// During a `SyncTestSession`, GGRS will simulate a rollback every frame and resimulate the last n states, where n is the given check distance.
/// The resimulated checksums will be compared with the original checksums and report if there was a mismatch.
/// Due to the decentralized nature of saving and loading gamestates, checksum comparisons can only be made if `check_distance` is 2 or higher.
/// This is a great way to test if your system runs deterministically. After creating the session, add a local player, set input delay for them and then start the session.
/// # Example
///
/// ```
/// # use ggrs::GGRSError;
/// # fn main() -> Result<(), GGRSError> {
/// let check_distance : u32 = 7;
/// let num_players : u32 = 2;
/// let input_size : usize = std::mem::size_of::<u32>();
/// let mut sess = ggrs::start_synctest_session(num_players, input_size, check_distance)?;
/// # Ok(())
/// # }
/// ```
///
/// # Errors
/// - Will return a `InvalidRequestError` if the number of players is higher than the allowed maximum (see `MAX_PLAYERS`).
/// - Will return a `InvalidRequestError` if `input_size` is higher than the allowed maximum (see  `MAX_INPUT_BYTES`).
/// - Will return a `InvalidRequestError` if the `check_distance is` higher than or equal to `MAX_PREDICTION_FRAMES`.
export const startSynctestSession = (
  numPlayers: number,
  inputSize: number,
  checkDistance: number
): Either<GGRSError, SyncTestSession> => {
  if (numPlayers > MAX_PLAYERS) {
    return either.left({ _type: "invalidRequest", info: "Too many players" })
  }

  if (inputSize > MAX_INPUT_BYTES) {
    return either.left({ _type: "invalidRequest", info: "Input size too big" })
  }

  if (checkDistance > MAX_PREDICTION_FRAMES - 1) {
    return either.left({ _type: "invalidRequest", info: "Check distance too big" })
  }

  if (checkDistance < 2) {
    return either.left({ _type: "invalidRequest", info: "Check distance too small" })
  }

  return either.right(new SyncTestSession(numPlayers, inputSize, checkDistance))
}
