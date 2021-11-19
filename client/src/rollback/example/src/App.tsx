import React, { FC, useEffect, useReducer, useState } from "react"
import Peer from "peerjs"
import { BoxesPeerJsGame } from "./boxes-p2p-rollback"
import { useKeyDown } from "../../../hooks/useKeyDown"
import { useInterval } from "../../../hooks/useInterval"
import { defaultInputSettings } from "../../../settings"
import { defaultGameSettings, initialGameState } from "./boxes-game"
import { BoxesGameView } from "./BoxesGameView"
import { pipe } from "fp-ts/function"
import { either } from "fp-ts"
import { customAlphabet } from "nanoid"

const nanoid = customAlphabet("1234567890abcdef", 10)
const idPrefix = "ts-rollback"

const otherIdQueryParam = "otherId"

export const App = () => {
  const [otherId] = useState(new URLSearchParams(window.location.search).get(otherIdQueryParam))
  const [ownId, setOwnId] = useState(nanoid())

  const [game, setGame] = useState<BoxesPeerJsGame | undefined>(undefined)

  const inputSettings = defaultInputSettings
  const left = useKeyDown(inputSettings.left)
  const right = useKeyDown(inputSettings.right)
  const up = useKeyDown(inputSettings.up)
  const down = useKeyDown(inputSettings.down)

  // TODO correct way of doing the render loop
  const [, forceRerender] = useReducer(x => x + 1, 0)
  useInterval(tick => {
    if (game) {
      game.onStep({ left, right, up, down })
      forceRerender()
    }
  }, 1000 / 60)

  useEffect(() => {
    if (otherId === null) {
      console.info("No host id")
      startGame()
    } else {
      console.info("Got host id: ", otherId)
      joinGame(otherId)
    }
  }, [])

  const startGame = async () => {
    const ownId = nanoid()
    const ownPeerId = idPrefix + ownId

    const ownPeer = await initPeer(ownPeerId)
    setOwnId(ownId)

    ownPeer.on("connection", conn => {
      conn.on("open", () => {
        setGame(createGame(ownPeer, conn.peer, 1))
      })
    })
  }

  const joinGame = async (otherId: string) => {
    const otherPeerId = idPrefix + otherId

    const ownId = nanoid()
    const ownPeerId = idPrefix + ownId
    const ownPeer = await initPeer(ownPeerId)

    console.info("Connecting to peer: " + otherPeerId)
    const conn = ownPeer.connect(otherPeerId)
    conn.on("open", () => {
      setGame(createGame(ownPeer, otherPeerId, 2))
    })
  }

  const networkStatsElem = pipe(
    either.fromNullable(undefined)(game),
    either.map(g => g.peerJsSession.networkStats(g.localPlayerIndex === 0 ? 1 : 0)),
    either.fold(
      _ => <div style={{ color: "white" }} />,
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
      {ownId && !otherId && <PeerLink id={ownId} />}
      {networkStatsElem}
      {game ? (
        <>
          <div style={{ color: "white", fontSize: "1.5em" }}>WASD to move</div>
          <BoxesGameView gamestate={game.gamestate} />
        </>
      ) : (
        <div>No game</div>
      )}
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

const initPeer = (id?: string): Promise<Peer> =>
  new Promise((resolve, reject) => {
    const peer = new Peer(id, {
      debug: 0
    })

    peer.on("error", err => {
      console.error(`[Peer ${id}:erro] ${err}`)
      reject(`Could not create peer ${err.toString()}`)
    })

    peer.on("open", _ => {
      console.info(`Created peer with id ${id}`)
      resolve(peer)
    })
  })

const PeerLink: FC<{ id: string }> = ({ id }) => {
  const [copied, setCopied] = useState(false)

  return (
    <div style={{ color: "white" }}>
      <p>
        Send this link to a friend or open a new window with it (make sure both are in view at the
        same time)
      </p>
      <a
        style={{ color: "white" }}
        href={`${window.location.href}?${otherIdQueryParam}=${id}`}
        target="_blank"
      >
        {`${window.location.href}?${otherIdQueryParam}=${id}`}
      </a>
      <button
        onClick={() => {
          const link = `${window.location.href}?${otherIdQueryParam}=${id}`
          navigator.clipboard.writeText(link).then(() => setCopied(true))
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}
