import Peer, { DataConnection } from "peerjs"
import { assert } from "../assert"
import { Message } from "./packet"

type LogEntry = {
  type: "sent" | "received"
  msg: Message
}

export class PeerJsSocket {
  peer: Peer
  connections: { [peerId: string]: DataConnection }
  onMessage: (from: string, pkg: Message) => void
  sendCount: number
  inputLog: LogEntry[] = new Array<LogEntry>()

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
      if (message.body._type === "input" || message.body._type === "inputAck")
        this.inputLog.push({ type: "received", msg: message })
      // console.debug(`[socket] Received ${message.body._type}`, message, this.inputLog)
      this.onMessage(conn.peer, message)
    })
  }

  sendTo = (peerId: string, message: Message) => {
    assert.defined(this.connections[peerId] !== undefined, `Connection does not exist ${peerId}`)
    message.header.sendCount = this.sendCount
    this.connections[peerId].send(message)
    if (message.body._type === "input" || message.body._type === "inputAck")
      this.inputLog.push({ type: "sent", msg: message })
    // console.debug(`[socket] Sent ${message.body._type}`, message, this.inputLog)
    this.sendCount++
  }
}
