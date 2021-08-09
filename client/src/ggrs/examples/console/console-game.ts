import * as assert from "assert"
import { GGRSRequest, startSynctestSession } from "./../../lib"
import { pipe } from "fp-ts/function"
import { GameState } from "./../../frame-info"
import { errorToMsg } from "./../../error"
import { either } from "fp-ts"

import { match } from "ts-adt"
import { throws } from "assert"
const readline = require("readline")

const FPS = 60
const NUM_PLAYERS = 2
const INPUT_SIZE = 2
const CHECK_DISTANCE = 3

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

type GameModel = {
  frame: number
  one: { x: number }
  two: { x: number }
}

export const init = () => {
  let sessionResult = startSynctestSession(NUM_PLAYERS, INPUT_SIZE, CHECK_DISTANCE)

  let history = new Array<GameModel>(100)

  let gameModel: GameModel = {
    frame: 0,
    one: { x: 0 },
    two: { x: 0 }
  }

  const gameModelToStore = (gm: GameModel): Uint8Array => {
    return new TextEncoder().encode(JSON.stringify(gm))
  }

  const storeToGameModel = (arr: Uint8Array): GameModel => {
    return JSON.parse(new TextDecoder().decode(arr))
  }

  const handleRequests = (request: GGRSRequest) => {
    pipe(
      request,
      match({
        advanceFrame: ({ inputs }) => {
          console.log(`Update frame ${gameModel.frame}`)
          let oneXVel = 0
          if (inputs[0].buffer[0] === 1) oneXVel++
          if (inputs[0].buffer[1] === 1) oneXVel--
          gameModel.one.x += oneXVel
          gameModel.frame++
        },
        loadGameState: ({ cell }) => {
          const modelToLoad = storeToGameModel(cell.gameState.buffer!)
          gameModel = modelToLoad
        },
        saveGameState: ({ cell, frame }) => {
          assert(cell.gameState.frame === gameModel.frame, "Frame desync")
          const buffer = gameModelToStore(gameModel)
          const checksum = frame
          cell.save(new GameState(frame, buffer, checksum))
        }
      })
    )
  }

  pipe(
    sessionResult,
    either.fold(
      err => console.log(errorToMsg(err)),
      session => {
        session.setFrameDelay(3, 0)
        session.setFrameDelay(3, 1)

        const recurse = () => {
          console.log("")
          console.log(`Frame ${gameModel.frame}`)
          rl.question("Input", (answer: string) => {
            const allInputs = new Array<Uint8Array>(2)
            allInputs.fill(new Uint8Array(2).fill(0))
            if (answer === "d") allInputs[0][0] = 1
            if (answer === "a") allInputs[0][1] = 1
            pipe(
              session.advanceFrame(allInputs),
              either.fold(
                err => {
                  throw errorToMsg(err)
                },
                requests => requests.forEach(handleRequests)
              )
            )
            recurse()
          })
        }
        recurse()
      }
    )
  )
}

init()
