import { GameSettings, GameState, Input } from "./boxes-game"
import { PeerJsSession } from "../../peerjs-session/peerjs-session"
import Peer from "peerjs"
import { pipe } from "fp-ts/function"
import * as either from "fp-ts/Either"
import { match } from "ts-adt"
import { RBRequest, SessionState } from "../../types"
import { SerializedGameInput } from "../../SerializedGameInput"
import { assert } from "../../assert"
import * as game from "./boxes-game"

const serializeGameState = (gamestate: GameState): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(gamestate))

const deserializeGameState = (serialized: Uint8Array): GameState =>
  JSON.parse(new TextDecoder().decode(serialized))

const INPUT_LENGTH = 1

const b2n = (b: boolean): number => (b ? 1 : 0)

const encodeInput = (input: Input): Uint8Array =>
  new Uint8Array([
    (b2n(input.left) << 3) | (b2n(input.right) << 2) | (b2n(input.up) << 1) | (b2n(input.down) << 0)
  ])

const decodeInput = (input: Uint8Array): Input => {
  const n = input[0]

  const bitOn = (pos: number): boolean => {
    const mask = 1 << pos
    return (n & mask) !== 0
  }

  return {
    down: bitOn(0),
    up: bitOn(1),
    right: bitOn(2),
    left: bitOn(3)
  }
}

export class BoxesPeerJsGame {
  settings: GameSettings
  gamestate: GameState
  peerJsSession: PeerJsSession
  localPlayerIndex: number
  framesToSkip: number

  constructor(
    peer: Peer,
    peerId: string,
    gamestate: GameState,
    settings: GameSettings,
    localPlayerNumber: number,
    framesToSkip: number
  ) {
    this.gamestate = gamestate
    this.settings = settings
    this.peerJsSession = new PeerJsSession(2, INPUT_LENGTH, peer)
    this.localPlayerIndex = localPlayerNumber - 1
    this.framesToSkip = framesToSkip

    pipe(
      either.Do,
      either.bind("localPlayerIndex", () =>
        this.peerJsSession.addLocalPlayer(localPlayerNumber - 1)
      ),
      either.chainFirst(({ localPlayerIndex }) =>
        this.peerJsSession.addRemotePlayer(localPlayerIndex === 0 ? 1 : 0, peerId)
      )
    )

    console.log(this.peerJsSession.startSession())
  }

  onStep = (input: Input) => {
    if (this.peerJsSession.currentState() == SessionState.Synchronizing) {
      this.peerJsSession.pollRemoteClients()
    }

    if (this.framesToSkip > 0) {
      this.framesToSkip--
      console.info("Skipping a frame as recommended")
      return
    }

    if (this.peerJsSession.currentState() == SessionState.Running) {
      const events = this.peerJsSession.drainEvents()

      console.debug("events", events)

      for (const ev of events) {
        if (ev._type === "waitRecommendation") {
          console.debug("Got wait recommendation")
          this.framesToSkip = this.framesToSkip + ev.skipFrames
        }
      }

      pipe(
        this.peerJsSession.advanceFrame(this.localPlayerIndex, encodeInput(input)),
        either.fold(
          err => console.error(err),
          reqs => this.handleRequests(reqs)
        )
      )
    }
  }

  advanceFrame = (inputs: SerializedGameInput[]) => {
    const decodedInputs = inputs.map(encoded => decodeInput(encoded.buffer))
    game.step(this.settings, this.gamestate)(decodedInputs[0], decodedInputs[1])
  }

  handleRequests = (requests: RBRequest[]) => {
    requests.forEach(request =>
      pipe(
        request,
        match({
          advanceFrame: ({ inputs }) => this.advanceFrame(inputs),
          saveGameState: ({ cell, frame }) => {
            assert.primitiveEqual(this.gamestate.step, frame)
            const buffer = serializeGameState(this.gamestate)
            const checksum = frame
            cell.save({ frame, buffer, checksum })
          },
          loadGameState: ({ cell }) => {
            this.gamestate = deserializeGameState(cell.gameState.buffer!)
          }
        })
      )
    )
  }
}
