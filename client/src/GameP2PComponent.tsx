import React, { useEffect, useReducer, useRef, useState } from "react"
import { useKeyDown } from "./hooks/useKeyDown"
import { useInterval } from "./hooks/useInterval"
import { defaultGameSettings, defaultInputSettings } from "./settings"
import * as game from "./game"
import { GameViewDebug } from "./GameViewDebug"
import { Rapier } from "./hooks/useRapier"
import Peer, { DataConnection } from "peerjs"
import { PeerJsGame } from "./game-p2p-rollback"

export const GameP2PComponent = (props: { rapier: Rapier }) => {
  // TODO correct way of doing the render loop
  const [, forceRerender] = useReducer(x => x + 1, 0)

  const [id, setId] = useState<string>("")
  const [peer, setPeer] = useState<Peer | undefined>(undefined)
  const [game, setGame] = useState<PeerJsGame | undefined>(undefined)

  const inputSettings = defaultInputSettings

  const left = useKeyDown(inputSettings.left)
  const right = useKeyDown(inputSettings.right)
  const up = useKeyDown(inputSettings.up)
  const down = useKeyDown(inputSettings.down)
  const jump = useKeyDown(inputSettings.jump)

  useInterval(tick => {
    if (game) {
      game.onStep({ left, right, up, down, jump })
      forceRerender()
    }
  }, 1000 / 30)

  const startGame = async () => {
    const [p, peerId] = await initPeer(id, {
      onConnection: (thisPeer, c) => {
        // console.info(`[Peer ${thisPeer.id}:conn] ${c.peer}`)
        c.on("data", d => {
          // console.info(`[Peer ${thisPeer.id}:data] from ${c.peer} : `, d)
        })
        c.on("open", () => {
          // c.send(`hello from ${thisPeer.id}`)
          setGame(createGame(thisPeer, c.peer, props.rapier, 1))
        })
      }
    })
    setPeer(p)

    if (id === "02") {
      const p21 = p.connect("01")
      p21.on("open", () => {
        // p21.send("hello from p2")
        setGame(createGame(p, "01", props.rapier, 2))
      })
      p21.on("data", d => {
        // console.info(d)
      })
    }
  }

  const init = async () => {
    setId(window.location.port.endsWith("0") ? "01" : "02")
  }

  useEffect(() => {
    init()
  }, [])

  return (
    <>
      <button onClick={() => startGame()}>Start</button>
      {game ? <GameViewDebug gamestate={game.gamestate} /> : <div>No game</div>}
    </>
  )
}

// -- GAME

const createGame = (peer: Peer, remotePeerId: string, rapier: Rapier, localPlayerNumber: number) =>
  new PeerJsGame(peer, remotePeerId, game.init(rapier), defaultGameSettings, localPlayerNumber)

// -- PEERJS

export type PeerCallbacks = {
  onConnection: (thisPeer: Peer, connection: DataConnection) => void
}

const initPeer = (id: string, callbacks: PeerCallbacks): Promise<[Peer, string]> =>
  new Promise((resolve, reject) => {
    console.info(`Attempting peer with id ${id}`)
    const peer = new Peer(id, {
      debug: 0,
      host: "localhost",
      port: 9000,
      path: "/peer"
    })

    peer.on("connection", c => callbacks.onConnection(peer, c))

    peer.on("error", err => {
      console.error(`[Peer ${id}:erro] ${err}`)
      reject("d")
    })

    peer.on("open", id => {
      resolve([peer, id])
    })
  })
