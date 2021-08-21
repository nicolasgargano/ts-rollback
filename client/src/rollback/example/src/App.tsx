import React, { useEffect, useReducer, useRef, useState } from "react"
import Peer, { DataConnection } from "peerjs"
import { BoxesPeerJsGame } from "./boxes-p2p-rollback"
import { useKeyDown } from "../../../hooks/useKeyDown"
import { useInterval } from "../../../hooks/useInterval"
import { defaultInputSettings } from "../../../settings"
import { defaultGameSettings, initialGameState } from "./boxes-game"
import { BoxesGameView } from "./BoxesGameView"
import { start } from "repl"
import { pipe } from "fp-ts/function"
import { either } from "fp-ts"

const defaultPlayer1peerId = "rollback-boxes-01"
const defaultPlayer2peerId = "rollback-boxes-02"

export const App = () => {
  // TODO correct way of doing the render loop

  // const [ownPeerId, setOwnPeerId] = useState<string>(defaultPlayer1peerId)
  // const [remotePeerId, setRemotePeerId] = useState<string>("rollback-boxes-01")

  const [game, setGame] = useState<BoxesPeerJsGame | undefined>(undefined)
  const [, forceRerender] = useReducer(x => x + 1, 0)

  const inputSettings = defaultInputSettings
  const left = useKeyDown(inputSettings.left)
  const right = useKeyDown(inputSettings.right)
  const up = useKeyDown(inputSettings.up)
  const down = useKeyDown(inputSettings.down)

  useInterval(tick => {
    if (game) {
      game.onStep({ left, right, up, down })
      forceRerender()
    }
  }, 1000 / 60)

  const startGame = async () => {
    const ownPeer = await initPeer(defaultPlayer1peerId)

    ownPeer.on("connection", conn => {
      conn.on("open", () => {
        setGame(createGame(ownPeer, conn.peer, 1))
      })
    })
  }

  const joinGame = async () => {
    const ownPeer = await initPeer(defaultPlayer2peerId)

    const conn = ownPeer.connect(defaultPlayer1peerId)
    conn.on("open", () => {
      setGame(createGame(ownPeer, defaultPlayer1peerId, 2))
    })
  }

  const networkStatsElem = pipe(
    either.fromNullable(undefined)(game),
    either.map(g => g.peerJsSession.networkStats(g.localPlayerIndex === 0 ? 1 : 0)),
    either.fold(
      _ => <div style={{ color: "white" }}>asd</div>,
      networkStats => (
        <div>
          <pre style={{ color: "white" }}>{game?.framesToSkip}</pre>
          <pre style={{ color: "white" }}>{JSON.stringify(networkStats, null, 2)}</pre>
        </div>
      )
    )
  )

  return (
    <>
      <div>
        {/*<input type="text" value={ownPeerId} onChange={ev => setOwnPeerId(ev.target.value)} />*/}
        <button onClick={startGame}>Create Game</button>
      </div>

      <div>
        {/*<input type="text" value={remotePeerId} onChange={ev => setRemotePeerId(ev.target.value)} />*/}
        <button onClick={joinGame}>Join Game</button>
      </div>

      {networkStatsElem}

      {game ? <BoxesGameView gamestate={game.gamestate} /> : <div>No game</div>}
    </>
  )
}

// -- GAME

const createGame = (peer: Peer, remotePeerId: string, localPlayerNumber: number) =>
  new BoxesPeerJsGame(
    peer,
    remotePeerId,
    initialGameState,
    defaultGameSettings,
    localPlayerNumber,
    0
  )

// -- PEERJS

const initPeer = (id: string): Promise<Peer> =>
  new Promise((resolve, reject) => {
    console.info(`Attempting to create peer with id ${id}`)
    const peer = new Peer(id, {
      debug: 0
    })

    peer.on("error", err => {
      console.error(`[Peer ${id}:erro] ${err}`)
      reject(`Could not create peer ${err.toString()}`)
    })

    peer.on("open", _ => {
      resolve(peer)
    })
  })
