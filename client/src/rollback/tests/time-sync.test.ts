import * as assert from "assert"
import { timeSync, TimeSyncData } from "../sync/time-sync"
import { defaults } from "../defaults"
import { SerializedGameInput } from "../SerializedGameInput"

describe("Time sync tests", () => {
  test("advance frame, no advantage", () => {
    const inputSize = 4
    const requireIdle = false
    const timeSyncSettings = defaults.timeSync
    const timeSyncData: TimeSyncData = timeSync.make(defaults.timeSync)

    for (let i = 0; i < 60; i++) {
      const input = new SerializedGameInput(i, inputSize, new Uint8Array([0, 0, 0, 0]))
      const localAdvantage = 0
      const remoteAdvantage = 0
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)(timeSyncData, timeSyncSettings)
    }

    assert(timeSync.recommendFrameDelay(requireIdle)(timeSyncData, timeSyncSettings) === 0)
  })

  test("advance frame, local advantage", () => {
    const inputSize = 4
    const requireIdle = false
    const timeSyncSettings = defaults.timeSync
    const timeSyncData: TimeSyncData = timeSync.make(defaults.timeSync)

    for (let i = 0; i < 60; i++) {
      const input = new SerializedGameInput(i, inputSize, new Uint8Array([0, 0, 0, 0]))
      const localAdvantage = 5
      const remoteAdvantage = -5
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)(timeSyncData, timeSyncSettings)
    }

    assert(timeSync.recommendFrameDelay(requireIdle)(timeSyncData, timeSyncSettings) === 0)
  })

  test("advance frame, small remote advantage", () => {
    const inputSize = 4
    const requireIdle = false
    const timeSyncSettings = defaults.timeSync
    const timeSyncData: TimeSyncData = timeSync.make(defaults.timeSync)

    for (let i = 0; i < 60; i++) {
      const input = new SerializedGameInput(i, inputSize, new Uint8Array([0, 0, 0, 0]))
      const localAdvantage = -1
      const remoteAdvantage = 1
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)(timeSyncData, timeSyncSettings)
    }

    assert(timeSync.recommendFrameDelay(requireIdle)(timeSyncData, timeSyncSettings) === 0)
  })

  test("advance frame, remote advantage", () => {
    const inputSize = 4
    const requireIdle = false
    const timeSyncSettings = defaults.timeSync
    const timeSyncData: TimeSyncData = timeSync.make(defaults.timeSync)

    for (let i = 0; i < 60; i++) {
      const input = new SerializedGameInput(i, inputSize, new Uint8Array([0, 0, 0, 0]))
      const localAdvantage = -4
      const remoteAdvantage = 4
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)(timeSyncData, timeSyncSettings)
    }

    assert(timeSync.recommendFrameDelay(requireIdle)(timeSyncData, timeSyncSettings) === 4)
  })

  test("advance frame, remote advantage but inputs not idle", () => {
    const inputSize = 4
    const requireIdle = true
    const timeSyncSettings = defaults.timeSync
    const timeSyncData: TimeSyncData = timeSync.make(defaults.timeSync)

    for (let i = 0; i < 60; i++) {
      const input = new SerializedGameInput(i, inputSize, new Uint8Array([0, 0, 0, 0]))
      let bytes = new Uint8Array(4).fill(0)
      bytes[0] = i
      input.copyIntoBuffer(bytes)
      const localAdvantage = -4
      const remoteAdvantage = 4
      timeSync.advanceFrame(input, localAdvantage, remoteAdvantage)(timeSyncData, timeSyncSettings)
    }

    const recommendedFrameDelay = timeSync.recommendFrameDelay(requireIdle)(
      timeSyncData,
      timeSyncSettings
    )
    assert(recommendedFrameDelay === 0)
  })
})
