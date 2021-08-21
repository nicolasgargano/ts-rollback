import { SyncLayer } from "../sync/SyncLayer"
import { AllSettings, defaults } from "../defaults"
import { nonEmptyArray } from "fp-ts"
import { SerializedGameInput } from "../SerializedGameInput"
import { ConnectionStatus, startingConnectionStatus } from "../network/packet"

describe("SyncLayer tests", () => {
  test("Reach prediction threshold", () => {
    const settings: AllSettings = defaults

    const maxPredictionFrames = settings.MAX_PREDICTION_FRAMES
    const inputSize = 3
    const frameDelay = 0

    const syncLayer = new SyncLayer(settings, 2, 3)

    nonEmptyArray.range(0, 20).forEach(frame => {
      const serializedInput = new Uint8Array(Array(inputSize).fill(frame))
      const input = new SerializedGameInput(frame, inputSize, serializedInput)

      const res = syncLayer.addLocalInput(settings)(frameDelay, 0, input)
      expect(res._tag).toBe(frame >= maxPredictionFrames - 1 ? "Left" : "Right")
      syncLayer.advanceFrame()
    })
  })

  test("Different delays", () => {
    const framesToLoop = 20
    const settings = { ...defaults, MAX_PREDICTION_FRAMES: framesToLoop + 2 }
    const inputSize = 5

    const sync = new SyncLayer(settings, 2, inputSize)
    const p1Delay = 2
    const p2Delay = 0

    const p1Index = 0
    const p2Index = 1

    const p1ConnectionStatus = startingConnectionStatus()
    const p2ConnectionStatus = startingConnectionStatus()
    const dummyConnectionStatuses: ConnectionStatus[] = [p1ConnectionStatus, p2ConnectionStatus]

    nonEmptyArray.range(0, framesToLoop).forEach(frame => {
      const serializedInput = new Uint8Array(Array(inputSize).fill(frame))
      const input = new SerializedGameInput(frame, inputSize, serializedInput)

      sync.addRemoteInput(p1Delay, p1Index, input)
      sync.addRemoteInput(p2Delay, p2Index, input)
      p1ConnectionStatus.lastFrame++
      p2ConnectionStatus.lastFrame++

      if (frame >= Math.max(p1Delay, p2Delay) + 1) {
        const syncedInputs = sync.synchronizedInputs(dummyConnectionStatuses)
        expect(syncedInputs[p1Index].buffer[0]).toEqual(frame - p1Delay)
        expect(syncedInputs[p2Index].buffer[0]).toEqual(frame - p2Delay)
      }

      sync.advanceFrame()
    })
  })
})

// BREAKING PREDICTION

const socketLog = [
  {
    type: "sent",
    msg: {
      header: {
        magic: 3447803487699570,
        sendCount: 11
      },
      body: {
        _type: "input",
        input: {
          peerConnectionStatuses: [
            {
              disconnected: false,
              lastFrame: 7
            },
            {
              disconnected: false,
              lastFrame: 4
            }
          ],
          disconnectRequested: false,
          startFrame: 3,
          ackFrame: -1,
          bytes: {
            "0": 0
          }
        }
      }
    }
  },
  {
    type: "sent",
    msg: {
      header: {
        magic: 3447803487699570,
        sendCount: 12
      },
      body: {
        _type: "input",
        input: {
          peerConnectionStatuses: [
            {
              disconnected: false,
              lastFrame: 7
            },
            {
              disconnected: false,
              lastFrame: 4
            }
          ],
          disconnectRequested: false,
          startFrame: 3,
          ackFrame: -1,
          bytes: {
            "0": 0,
            "1": 0
          }
        }
      }
    }
  },
  {
    type: "sent",
    msg: {
      header: {
        magic: 3447803487699570,
        sendCount: 13
      },
      body: {
        _type: "input",
        input: {
          peerConnectionStatuses: [
            {
              disconnected: false,
              lastFrame: 7
            },
            {
              disconnected: false,
              lastFrame: 4
            }
          ],
          disconnectRequested: false,
          startFrame: 3,
          ackFrame: -1,
          bytes: {
            "0": 0,
            "1": 0,
            "2": 0
          }
        }
      }
    }
  },
  {
    type: "received",
    msg: {
      header: {
        magic: 562552849379794.9,
        sendCount: 11
      },
      body: {
        _type: "input",
        input: {
          peerConnectionStatuses: [
            {
              disconnected: false,
              lastFrame: -1
            },
            {
              disconnected: false,
              lastFrame: 3
            }
          ],
          disconnectRequested: false,
          startFrame: 3,
          ackFrame: -1,
          bytes: {}
        }
      }
    }
  },
  {
    type: "sent",
    msg: {
      header: {
        magic: 3447803487699570,
        sendCount: 14
      },
      body: {
        _type: "inputAck",
        inputAck: {
          ackFrame: 3
        }
      }
    }
  },
  {
    type: "sent",
    msg: {
      header: {
        magic: 3447803487699570,
        sendCount: 15
      },
      body: {
        _type: "input",
        input: {
          peerConnectionStatuses: [
            {
              disconnected: false,
              lastFrame: 7
            },
            {
              disconnected: false,
              lastFrame: 4
            }
          ],
          disconnectRequested: false,
          startFrame: 3,
          ackFrame: 3,
          bytes: {
            "0": 0,
            "1": 0,
            "2": 0,
            "3": 0
          }
        }
      }
    }
  },
  {
    type: "received",
    msg: {
      header: {
        magic: 562552849379794.9,
        sendCount: 12
      },
      body: {
        _type: "inputAck",
        inputAck: {
          ackFrame: 3
        }
      }
    }
  },
  {
    type: "received",
    msg: {
      header: {
        magic: 562552849379794.9,
        sendCount: 13
      },
      body: {
        _type: "input",
        input: {
          peerConnectionStatuses: [
            {
              disconnected: false,
              lastFrame: 3
            },
            {
              disconnected: false,
              lastFrame: 4
            }
          ],
          disconnectRequested: false,
          startFrame: 3,
          ackFrame: 3,
          bytes: {}
        }
      }
    }
  },
  {
    type: "sent",
    msg: {
      header: {
        magic: 3447803487699570,
        sendCount: 16
      },
      body: {
        _type: "input",
        input: {
          peerConnectionStatuses: [
            {
              disconnected: false,
              lastFrame: 7
            },
            {
              disconnected: false,
              lastFrame: 4
            }
          ],
          disconnectRequested: false,
          startFrame: 4,
          ackFrame: 3,
          bytes: {
            "0": 0,
            "1": 0,
            "2": 0,
            "3": 0
          }
        }
      }
    }
  },
  {
    type: "received",
    msg: {
      header: {
        magic: 562552849379794.9,
        sendCount: 14
      },
      body: {
        _type: "input",
        input: {
          peerConnectionStatuses: [
            {
              disconnected: false,
              lastFrame: 3
            },
            {
              disconnected: false,
              lastFrame: 5
            }
          ],
          disconnectRequested: false,
          startFrame: 4,
          ackFrame: 3,
          bytes: {}
        }
      }
    }
  }
]
