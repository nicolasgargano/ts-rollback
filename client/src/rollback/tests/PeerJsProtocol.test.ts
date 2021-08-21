import { Frame } from "../types"
import { assert } from "../assert"

describe("Peer JS Protocol", () => {
  test("Pop pending output", () => {
    let lastAckedInput: { frame: number } = { frame: -1 }

    const pendingOutput: { frame: number }[] = [
      { frame: 0 },
      { frame: 1 },
      { frame: 2 },
      { frame: 3 },
      { frame: 4 },
      { frame: 5 },
      { frame: 6 },
      { frame: 7 }
    ]

    // TODO this is a copy of function used above,
    //  I need to set up the test correctly.
    const popPendingOutput = (ackFrame: Frame) => {
      let maybeInput: { frame: number } | undefined = pendingOutput[0]
      while (maybeInput !== undefined) {
        if (maybeInput.frame <= ackFrame) {
          lastAckedInput = maybeInput
          pendingOutput.shift()
          maybeInput = pendingOutput[0]
        } else {
          break
        }
      }
    }

    popPendingOutput(4)
    assert.primitiveEqual(lastAckedInput.frame, 4)
    assert.primitiveEqual(pendingOutput[0].frame, 5)
  })
})
