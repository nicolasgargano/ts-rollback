import React, { useEffect, useReducer, useState } from "react"
import Peer, { DataConnection } from "peerjs"
import { ConsoleGame, initialGameModel } from "../../console-game-p2p"
import { initialGameState } from "../../../../../data"
import { ConsoleGameWindow } from "./ConsoleGameWindow"
import { GameInput } from "../../../../frame-info"
import { useInterval } from "../../../../../hooks/useInterval"

export type PeerCallbacks = {
  onConnection: (thisPeer: Peer, connection: DataConnection) => void
}

export const App = () => {
  // TODO how to rerender on game loop with jsx and hooks (no imperative drawing)
  const [ignored, forceUpdate] = useReducer(x => x + 1, 0)

  const [peer1, setPeer1] = useState<Peer | undefined>(undefined)
  const [peer2, setPeer2] = useState<Peer | undefined>(undefined)
  const [game1, setGame1] = useState<ConsoleGame | undefined>(undefined)
  const [game2, setGame2] = useState<ConsoleGame | undefined>(undefined)
  const a = useInterval(tick => {
    // game1?.peerJsSession.pollRemoteClients()
    // game2?.peerJsSession.pollRemoteClients()
    step()
    return
  }, 50)

  const step = async () => {
    const p1Input = { left: false, right: true }
    const p2Input = { left: false, right: false }

    game1?.onStep(p1Input)
    game2?.onStep(p2Input)

    forceUpdate()
  }

  const init = async () => {
    const [p1, id1] = await initPeer("ggrs-ts-id-01", {
      onConnection: (thisPeer, c) => {
        console.info(`[Peer ${thisPeer.id}:conn] ${c.peer}`)
        c.on("data", d => {
          console.info(`[Peer ${thisPeer.id}:data] from ${c.peer} : `, d)
        })
        c.on("open", () => {
          c.send(`hello from ${thisPeer.id}`)
          setGame1(createGame(thisPeer, c.peer, 1))
        })
      }
    })

    setPeer1(p1)

    const [p2, id2] = await initPeer("ggrs-ts-id-01", { onConnection: () => {} })
    setPeer2(p2)
    console.log(p1.id)
    console.log(p2.id)

    const p21 = p2.connect(id1)
    p21.on("open", () => {
      p21.send("hello from p2")
      setGame2(createGame(p2, id1, 2))
    })
    p21.on("data", d => {
      console.info(d)
    })
  }

  useEffect(() => {
    init()
  }, [])

  return (
    <main>
      <div>
        <button onClick={() => step()}>Advance</button>
        <div>{JSON.stringify(ignored)}</div>
      </div>
      <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
        <div style={{ flexGrow: 1 }}>
          <h1>Game 1</h1>
          {game1 && peer1 ? <ConsoleGameWindow key="game1" game={game1} peer={peer1} /> : <div />}
        </div>
        <div style={{ flexGrow: 1 }}>
          <h1>Game 2</h1>
          {game2 && peer2 ? <ConsoleGameWindow key="game2" game={game2} peer={peer2} /> : <div />}
        </div>
      </div>
    </main>
  )
}

const initPeer = (id: string, callbacks: PeerCallbacks): Promise<[Peer, string]> =>
  new Promise((resolve, _) => {
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
