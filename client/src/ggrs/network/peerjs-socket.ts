import Peer, { DataConnection } from "peerjs"
import { Message } from "./packet"
import { assert } from "../assert"

export class PeerJsSocket {
  peer: Peer
  connections: { [peerId: string]: DataConnection }
  onMessage: (from: string, pkg: Message) => void
  sendCount: number

  constructor(peer: Peer, onMessage: (from: string, msg: Message) => void) {
    this.peer = peer
    this.onMessage = onMessage
    this.connections = {}
    this.sendCount = 0

    Object.values(this.peer.connections).forEach(conn => {
      this.registerConnection((conn as DataConnection[])[0])
    })

    this.peer.on("disconnected", () => {
      console.warn("Disconnected")
    })

    this.peer.on("error", err => {
      console.error("Peer error", err)
    })
  }

  registerConnection = (conn: DataConnection) => {
    this.connections[conn.peer] = conn

    // TODO does binary work out of the box? https://peerjs.com/docs.html#peerconnect-options-serialization
    // conn.serialization = 'json'

    conn.on("close", () => {
      console.log(`[socket] Closed connection with peer ${conn.peer}`)
    })

    conn.on("data", data => {
      const message = data as Message
      if (message === undefined) {
        console.warn("[socket] Received invalid message", data)
        return
      }
      console.debug(`[socket] Received ${message.body._type}`, message)
      this.onMessage(conn.peer, message)
    })
  }

  sendTo = (peerId: string, message: Message) => {
    assert(this.connections[peerId] !== undefined, `Connection does not exist ${peerId}`)
    console.debug(`[socket] Sending ${message.body._type}`, message)
    message.header.sendCount = this.sendCount
    this.connections[peerId].send(message)
    this.sendCount++
  }
}
