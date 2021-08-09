import { TimeSync } from "../time-sync"
import { GameInput } from "../frame-info"
import * as assert from "assert"

describe("Time sync tests", () => {
  test("advance frame, no advantage", () => {
    const inputSize = 4
    const requireIdle = false
    let timeSync = new TimeSync()

    for (let i = 0; i < 60; i++) {
      const input = new GameInput(i, inputSize)
      const localAdvantage = 0
      const remoteAdvantage = 0
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)
    }

    assert(timeSync.recommendFrameDelay(requireIdle) === 0)
  })

  test("advance frame, local advantage", () => {
    const inputSize = 4
    const requireIdle = false
    let timeSync = new TimeSync()

    for (let i = 0; i < 60; i++) {
      const input = new GameInput(i, inputSize)
      const localAdvantage = 5
      const remoteAdvantage = -5
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)
    }

    assert(timeSync.recommendFrameDelay(requireIdle) === 0)
  })

  test("advance frame, small remote advantage", () => {
    const inputSize = 4
    const requireIdle = false
    let timeSync = new TimeSync()

    for (let i = 0; i < 60; i++) {
      const input = new GameInput(i, inputSize)
      const localAdvantage = -1
      const remoteAdvantage = 1
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)
    }

    assert(timeSync.recommendFrameDelay(requireIdle) === 0)
  })

  test("advance frame, remote advantage", () => {
    const inputSize = 4
    const requireIdle = false
    let timeSync = new TimeSync()

    for (let i = 0; i < 60; i++) {
      const input = new GameInput(i, inputSize)
      const localAdvantage = -4
      const remoteAdvantage = 4
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)
    }

    assert(timeSync.recommendFrameDelay(requireIdle) === 4)
  })

  test("advance frame, remote advantage but inputs not idle", () => {
    const inputSize = 4
    const requireIdle = false
    let timeSync = new TimeSync()

    for (let i = 0; i < 60; i++) {
      const input = new GameInput(i, inputSize)
      let bytes = new Uint8Array(4).fill(0)
      bytes[0] = i
      input.copyInput(bytes)
      const localAdvantage = -4
      const remoteAdvantage = 4
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)
    }

    assert(timeSync.recommendFrameDelay(requireIdle) === 0)
  })
})
