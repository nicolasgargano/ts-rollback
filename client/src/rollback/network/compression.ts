import { Either } from "fp-ts/Either"
import { either } from "fp-ts"
import { assert } from "../assert"
import { SerializedGameInput } from "../SerializedGameInput"
import { Frame } from "../types"

const encode = (
  reference: SerializedGameInput,
  pendingInput: SerializedGameInput[]
): Uint8Array => {
  // TODO XOR delta with reference and then RLE
  return pendingInput.reduce((acc, curr, i) => {
    acc.set(curr.buffer, reference.inputSize * i)
    return acc
  }, new Uint8Array(reference.inputSize * pendingInput.length))
}

const decode = (
  reference: SerializedGameInput,
  startFrame: Frame,
  data: Uint8Array
): Either<null, SerializedGameInput[]> => {
  // TODO RLE and then delta
  const amountOfInputs = data.byteLength / reference.inputSize
  assert.primitiveEqual(amountOfInputs, Math.floor(amountOfInputs))

  const inputsArray = new Array<SerializedGameInput>(amountOfInputs)

  for (let i = 0; i < amountOfInputs; i++) {
    const slice = data.slice(i * reference.inputSize, (i + 1) * reference.inputSize)
    const buffer = new Uint8Array(slice)
    inputsArray[i] = new SerializedGameInput(startFrame + i, reference.inputSize, buffer)
  }

  return either.right(inputsArray)
}

/*


-- MODULE


*/

export const compression = {
  encode,
  decode
}
