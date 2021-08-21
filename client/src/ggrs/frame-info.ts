import { Frame, MAX_INPUT_BYTES, MAX_PLAYERS, NULL_FRAME } from "./lib"
import { Default } from "./impl"
import { assert } from "./assert"

// TODO
export const checksumFn = (input: Uint8Array): number => {
  return 0
}

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

// -- GAME INPUT

// Represents a serialized input for a single player in a single frame. This struct holds a `buffer` where the first `size` bytes represent the encoded input of a single player.
// The associated frame is denoted with `frame`. You do not need to create this struct, but the peerjs-session will provide a `Vec<GameInput>` for you during `advance_frame()`.
export class GameInput {
  // The frame to which this info belongs to. -1/`NULL_FRAME` represents an invalid frame
  frame: Frame
  // The input size
  size: number
  // An input buffer that will hold input data
  buffer: Uint8Array

  constructor(frame: Frame = NULL_FRAME, size = 0) {
    this.frame = frame
    this.size = size
    this.buffer = new Uint8Array(MAX_INPUT_BYTES * MAX_PLAYERS)
  }

  copyInput = (bytes: Uint8Array) => {
    assert(
      bytes.length === this.size,
      `[GameInput:copyInput] input lengths don't match, bytes.length = ${bytes.length}, this.size = ${this.size}`
    )

    this.buffer = this.buffer.slice(0, bytes.length)
    for (let i = 0; i < bytes.length; i++) {
      this.buffer[i] = bytes[i]
    }
  }

  eraseBits = () => {
    this.buffer.fill(0)
  }

  equal = (other: GameInput, bitsOnly: boolean): boolean =>
    (bitsOnly || this.frame === other.frame) &&
    this.size === other.size &&
    GameInput.compareUint8Arrays(this.buffer, other.buffer)

  private static compareUint8Arrays = (one: Uint8Array, other: Uint8Array): boolean => {
    for (let i = 0; i < one.length; i++) {
      if (one[i] !== other[i]) return false
    }
    return true
  }

  static clone = (original: GameInput) => new GameInput(original.frame, original.size)

  input = () => this.buffer
}
