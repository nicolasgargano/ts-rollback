import { Frame } from "../types"

// Represents a serialized game state of your game for a single frame. The buffer `buffer` holds your state, `frame` indicates the associated frame number
// and `checksum` can additionally be provided for use during a `SyncTestSession`. You are expected to return this during `save_game_state()` and use them during `load_game_state()`.
export class GameState {
  /// The frame to which this info belongs to.
  frame: Frame
  /// The serialized gamestate in bytes.
  buffer: Uint8Array | null
  /// The checksum of the gamestate.
  checksum: number

  constructor(frame: Frame, maybeBuffer: Uint8Array | null, maybeChecksum: number | null) {
    const checksum = maybeChecksum ? maybeChecksum : maybeBuffer ? checksumFn(maybeBuffer) : 0
    this.frame = frame
    this.buffer = maybeBuffer
    this.checksum = checksum
  }

  static clone = (gameState: GameState): GameState =>
    new GameState(gameState.frame, gameState.buffer, gameState.checksum)
}

// TODO
const checksumFn = (input: Uint8Array): number => {
  return 0
}
