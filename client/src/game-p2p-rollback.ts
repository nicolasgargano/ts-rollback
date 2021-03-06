import { GameModelBase, GameState, Input } from "./game"
import * as game from "./game"
import { World } from "@dimforge/rapier2d-compat"
import Peer from "peerjs"
import { pipe } from "fp-ts/function"
import * as either from "fp-ts/Either"
import { match } from "ts-adt"
import { GameSettings } from "./settings"
import { PeerJsSession } from "./rollback/peerjs-session/peerjs-session"
import { RBRequest, SessionState } from "./rollback/types"
import { assert } from "./rollback/assert"
import { SerializedGameInput } from "./rollback/SerializedGameInput"

type SerializableGameState = GameModelBase & { world: Uint8Array }

const serializeGameState = (gamestate: GameState): Uint8Array => {
  const serializable: SerializableGameState = {
    ...gamestate,
    world: gamestate.world.takeSnapshot()
  }
  return new TextEncoder().encode(JSON.stringify(serializable))
}

const deserializeGameState = (serialized: Uint8Array): GameState => {
  const deserialized: SerializableGameState = JSON.parse(new TextDecoder().decode(serialized))
  const gamestate = { ...deserialized, world: World.restoreSnapshot(deserialized.world) }
  if (gamestate.world === null) {
    console.debug("")
  }
  return gamestate
}

/*
0 = 00000
1 = 00001
2 = 00010
3 = 00011
4 = 00100
5 = 00101
6 = 00110
7 = 00111
8 = 01000
 */

const b2n = (n: boolean) => (n ? 1 : 0)

const INPUT_LENGTH = 1

const encodeInput = (input: Input): Uint8Array =>
  new Uint8Array([(b2n(input.left) << 2) | (b2n(input.jump) << 1) | (b2n(input.right) << 0)])

const decodeInput = (input: Uint8Array): Input => {
  const n = input[0]

  const leftMask = 1 << 2
  const jumpMask = 1 << 1
  const rightMask = 1 << 0

  return {
    left: (n & leftMask) !== 0,
    jump: (n & jumpMask) !== 0,
    right: (n & rightMask) !== 0,
    up: false,
    down: false
  }
}

// --

export class PeerJsGame {
  settings: GameSettings
  gamestate: GameState
  peerJsSession: PeerJsSession
  localPlayerIndex: number

  constructor(
    peer: Peer,
    peerId: string,
    gamestate: GameState,
    settings: GameSettings,
    localPlayerNumber: number
  ) {
    this.gamestate = gamestate
    this.settings = settings
    this.peerJsSession = new PeerJsSession(2, INPUT_LENGTH, peer)
    this.localPlayerIndex = localPlayerNumber - 1

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

    if (this.peerJsSession.currentState() == SessionState.Running) {
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
