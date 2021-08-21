// -- GAME INPUT

// Represents a serialized input for a single player in a single frame. It holds a `buffer` where the first `size` bytes represent the encoded input of a single player.
// The associated frame is denoted with `frame`. You do not need to create this struct, but the peerjs-session will provide a `Vec<GameInput>` for you during `advance_frame()`.
import { Frame, NULL_FRAME } from "./types"
import { assert } from "./assert"
import { AllSettings } from "./defaults"

export class SerializedGameInput {
  // The frame to which this info belongs to.
  frame: Frame
  // The input size
  inputSize: number
  // An input buffer that will hold input data
  buffer: Uint8Array

  constructor(frame: Frame, inputSize: number, buffer: Uint8Array) {
    this.frame = frame
    this.inputSize = inputSize
    this.buffer = buffer
  }

  copyIntoBuffer = (bytes: Uint8Array): SerializedGameInput => {
    assert.primitiveEqual(bytes.length, this.inputSize)
    this.buffer = this.buffer.slice(0, bytes.length)
    for (let i = 0; i < bytes.length; i++) {
      this.buffer[i] = bytes[i]
    }
    return this
  }

  clearBuffer = () => {
    this.buffer.fill(0)
  }

  public copyFrom = (other: SerializedGameInput) => {
    this.frame = other.frame
    this.inputSize = other.inputSize
    this.copyIntoBuffer(other.buffer)
  }

  public static clone = (other: SerializedGameInput): SerializedGameInput =>
    new SerializedGameInput(other.frame, other.inputSize, other.buffer.slice(0))

  public static equals = (
    a: SerializedGameInput,
    b: SerializedGameInput,
    compareBits: boolean
  ): boolean =>
    (compareBits || a.frame === b.frame) &&
    a.inputSize === b.inputSize &&
    SerializedGameInput.equalInput(a, b)

  public static equalInput = (a: SerializedGameInput, b: SerializedGameInput): boolean =>
    !a.buffer.some((byte, i) => b.buffer[i] !== byte)
}

const defaultForSettings = (settings: AllSettings) =>
  new SerializedGameInput(
    NULL_FRAME,
    0,
    new Uint8Array(settings.MAX_INPUT_BYTES * settings.MAX_PLAYERS)
  )

export const gameInput = {
  defaultForSettings
}
