import Peer, { DataConnection } from "peerjs"
import React, { useEffect } from "react"
import { useState, useRef } from "react"
import * as option from "fp-ts/Option"
import { Option } from "fp-ts/Option"
import { pipe } from "fp-ts/function"
import { console } from "fp-ts"

export const App = () => {
  const [peerId, setPeerId] = useState("")
  const [maybePeer, setMaybePeer] = useState<Option<Peer>>(option.none)
  const [maybeConnection, setMaybeConnection] = useState<
    Option<DataConnection>
  >(option.none)

  useEffect(() => {
    const peer = new Peer()
    peer.on("open", id => {
      console.info(`Got id! ${id}`)
      setMaybePeer(option.some(peer))
    })

    peer.on("connection", connection => {
      console.info(`Connection established! ${connection.peer}`)
      setMaybeConnection(option.some(connection))
    })
  }, [])

  const connect = async (peer: Peer) => {
    console.log(`Connecting to ${peerId}`)
    const connection = await peer.connect(peerId)
    setMaybeConnection(option.some(connection))
  }

  const MaybePeerElement = () =>
    pipe(
      maybePeer,
      option.fold(
        () => <div>no peer</div>,
        peer => (
          <div>
            <div>🧐 your id is: {peer.id}</div>
            <div>
              <input type={"text"} onChange={e => setPeerId(e.target.value)} />
              <button onClick={() => connect(peer)}>connect to peer 👉</button>
            </div>
          </div>
        )
      )
    )

  const MaybeConnectionElement = () =>
    pipe(
      maybeConnection,
      option.fold(
        () => <div>no connection</div>,
        conn => <div>🤝 connected to {conn.peer}</div>
      )
    )

  return (
    <div>
      <h1>Connect</h1>
      <MaybePeerElement />
      <h1>Connection</h1>
      <MaybeConnectionElement />
    </div>
  )
}
