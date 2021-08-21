import { Frame, NULL_FRAME } from "./types"

const expr = (expr: boolean, msg: string) => {
  if (expr) return
  else throw new Error(msg)
}

const truthy = (bool: boolean) => {
  expr(bool, `Expected ${bool} to be true`)
}

const primitiveEqual = <A>(a: A, b: A) =>
  expr(a === b, `Expected a === b but got: a = ${a} and b = ${b}`)

const isSequentialFrame = (other: Frame, frame: Frame) =>
  expr(
    other === NULL_FRAME || frame === other + 1,
    `Expected frame ${frame} to be the next from ${other}`
  )

const isNullFrame = (frame: Frame) =>
  expr(frame === NULL_FRAME, `Expected frame ${frame} to be NULL_FRAME (-1)`)

const notNullFrame = (frame: Frame) =>
  expr(frame !== NULL_FRAME, `Expected frame ${frame} to *NOT* be NULL_FRAME (-1)`)

const defined = <A>(a: A, msg?: string) =>
  expr(a !== undefined, msg ?? "Expected this to be !== undefined")

/*


-- MODULE


*/

export const assert = {
  expr,
  defined,
  truthy,
  isNullFrame,
  notNullFrame,
  isSequentialFrame,
  primitiveEqual
}
