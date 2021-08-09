import { GameInput, GameState } from "../../frame-info"
import { GGRSRequest, SessionState } from "../../lib"
import { pipe } from "fp-ts/function"
import { match } from "ts-adt"
import Peer from "peerjs"
import { PeerJsSession } from "../../sessions/peerjs-session"
import * as either from "fp-ts/Either"
import { assert } from "../../assert"

type GameModel = {
  frame: number
  one: { x: number }
  two: { x: number }
}

export const initialGameModel: GameModel = {
  frame: 0,
  one: { x: -5 },
  two: { x: 5 }
}

const onFrame =
  (previous: GameModel) =>
  (inputs: GameInput[]): GameModel => {
    const gameModel = { ...previous }
    const decodedInputs = inputs.map(decodeGameInput)

    console.log(`Update frame ${gameModel.frame}`, decodedInputs)

    let oneXVel = 0
    if (decodedInputs[0].right) oneXVel++
    if (decodedInputs[0].left) oneXVel--

    let twoXVel = 0
    if (decodedInputs[1].right) twoXVel++
    if (decodedInputs[1].left) twoXVel--

    gameModel.one.x += oneXVel
    gameModel.two.x += twoXVel
    gameModel.frame++
    return gameModel
  }

const gameModelToStore = (gm: GameModel): Uint8Array => {
  return new TextEncoder().encode(JSON.stringify(gm))
}

const storeToGameModel = (arr: Uint8Array): GameModel => {
  return JSON.parse(new TextDecoder().decode(arr))
}

export type ConsoleGameInput = {
  right: boolean
  left: boolean
}

export const encodeGameInput = (localPlayerInput: ConsoleGameInput): Uint8Array =>
  new Uint8Array([localPlayerInput.right ? 1 : 0, localPlayerInput.left ? 1 : 0])

export const decodeGameInput = (gameInput: GameInput): ConsoleGameInput => {
  return {
    right: gameInput.buffer[0] === 1,
    left: gameInput.buffer[1] === 1
  }
}

export class ConsoleGame {
  model: GameModel
  peerJsSession: PeerJsSession
  localPlayerIndex: number

  constructor(peer: Peer, peerId: string, model: GameModel, localPlayerNumber: number) {
    this.model = model
    this.peerJsSession = new PeerJsSession(2, 2, peer)
    this.localPlayerIndex = localPlayerNumber - 1

    pipe(
      either.Do,
      either.bind("localPlayerIndex", () =>
        this.peerJsSession.addLocalPlayer(localPlayerNumber - 1)
      ),
      either.chainFirst(({ localPlayerIndex }) =>
        this.peerJsSession.setFrameDelay(3, localPlayerIndex)
      ),
      either.chainFirst(({ localPlayerIndex }) =>
        this.peerJsSession.addRemotePlayer(localPlayerIndex === 0 ? 1 : 0, peerId)
      )
    )

    console.log(this.peerJsSession.startSession())
  }

  onStep = (input: ConsoleGameInput) => {
    if (this.peerJsSession.currentState() == SessionState.Synchronizing) {
      this.peerJsSession.pollRemoteClients()
    }

    if (this.peerJsSession.currentState() == SessionState.Running) {
      pipe(
        this.peerJsSession.advanceFrame(this.localPlayerIndex, encodeGameInput(input)),
        either.fold(
          err => console.error(err),
          reqs => this.handleRequests(reqs)
        )
      )
    }
  }

  advanceFrame = (inputs: GameInput[]) => {
    this.model = onFrame(this.model)(inputs)
  }

  handleRequests = (requests: GGRSRequest[]) => {
    requests.forEach(request =>
      pipe(
        request,
        match({
          advanceFrame: ({ inputs }) => this.advanceFrame(inputs),
          saveGameState: ({ cell, frame }) => {
            assert(this.model.frame === frame, "Frame desync")
            const buffer = gameModelToStore(this.model)
            const checksum = frame
            cell.save(new GameState(frame, buffer, checksum))
          },
          loadGameState: ({ cell }) => {
            this.model = storeToGameModel(cell.gameState.buffer!)
          }
        })
      )
    )
  }
}
