import { GameInput } from "../frame-info"
import { Frame } from "../lib"
import { Either } from "fp-ts/Either"
import { either } from "fp-ts"
import { assert } from "../assert"

export const encode = (reference: GameInput, pendingInput: GameInput[]): Uint8Array => {
  // TODO XOR delta with reference and then RLE
  return pendingInput.reduce((acc, curr, i) => {
    acc.set(curr.buffer, reference.size * i)
    return acc
  }, new Uint8Array(reference.size * pendingInput.length))
}

export const decode = (
  reference: GameInput,
  startFrame: Frame,
  data: Uint8Array
): Either<null, GameInput[]> => {
  // TODO RLE and then delta
  const amountOfInputs = data.byteLength / reference.size
  assert(amountOfInputs === Math.floor(amountOfInputs))

  const inputsArray = new Array<GameInput>(amountOfInputs)

  for (let i = 0; i < amountOfInputs; i++) {
    const input = new GameInput(startFrame + i, reference.size)
    input.buffer = new Uint8Array(data.slice(i * reference.size, (i + 1) * reference.size))
    inputsArray[i] = input
  }

  return either.right(inputsArray)
}
