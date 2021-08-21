import React, { useEffect, useReducer, useState } from "react"
import Peer, { DataConnection } from "peerjs"
import { ConsoleGame, initialGameModel } from "../../console-game-p2p"
import { ConsoleGameWindow } from "./ConsoleGameWindow"
import { GameInput } from "../../../../frame-info"
import { useInterval } from "../../../../../hooks/useInterval"

export type PeerCallbacks = {
  onConnection: (thisPeer: Peer, connection: DataConnection) => void
}

export const App = () => {
  // TODO how to rerender on game loop with jsx and hooks (no imperative drawing)
  const [ignored, forceUpdate] = useReducer(x => x + 1, 0)
  const [id, setId] = useState<string>("")
  const [peer, setPeer] = useState<Peer | undefined>(undefined)
  const [game, setGame] = useState<ConsoleGame | undefined>(undefined)

  const a = useInterval(tick => {
    step()
    return
  }, 50)

  const step = async () => {
    const input = { left: id === "01", right: id === "02" }
    game?.onStep(input)
    forceUpdate()
  }

  const startGame = async () => {
    const [p, peerId] = await initPeer(id, {
      onConnection: (thisPeer, c) => {
        console.info(`[Peer ${thisPeer.id}:conn] ${c.peer}`)
        c.on("data", d => {
          console.info(`[Peer ${thisPeer.id}:data] from ${c.peer} : `, d)
        })
        c.on("open", () => {
          c.send(`hello from ${thisPeer.id}`)
          setGame(createGame(thisPeer, c.peer, 1))
        })
      }
    })
    setPeer(p)

    if (id === "02") {
      const p21 = p.connect("01")
      p21.on("open", () => {
        p21.send("hello from p2")
        setGame(createGame(p, "01", 2))
      })
      p21.on("data", d => {
        console.info(d)
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
    <main>
      <div>
        <button onClick={() => startGame()}>Start</button>
        <button onClick={() => step()}>Advance</button>
        <div>{JSON.stringify(ignored)}</div>
      </div>
      <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
        <div style={{ flexGrow: 1 }}>
          <h1>Local Game</h1>
          {game && peer ? <ConsoleGameWindow key="game1" game={game} peer={peer} /> : <div />}
        </div>
      </div>
    </main>
  )
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

const sleep = (interval: number) =>
  new Promise((resolve, reject) => {
    setTimeout(resolve, interval)
  })

const createGame = (peer: Peer, remotePeerId: string, localPlayerNumber: number) =>
  new ConsoleGame(peer, remotePeerId, initialGameModel, localPlayerNumber)
