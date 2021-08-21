import { ADT } from "ts-adt"
import { Frame, NULL_FRAME } from "../types"

export type ConnectionStatus = {
  disconnected: boolean
  lastFrame: number
}

export const startingConnectionStatus = () => ({
  disconnected: false,
  lastFrame: NULL_FRAME
})

export type SyncRequest = {
  // please reply back with this random data
  randomRequest: number
}

export type SyncResponse = {
  // here's your random data back
  randomResponse: number
}

export class Input {
  peerConnectionStatuses: Array<ConnectionStatus>
  disconnectRequested: boolean
  startFrame: Frame
  ackFrame: Frame
  bytes: Uint8Array

  constructor(
    peerConnectStatus = new Array<ConnectionStatus>(),
    disconnectRequested = false,
    startFrame = NULL_FRAME,
    ackFrame = NULL_FRAME,
    bytes = new Uint8Array()
  ) {
    this.peerConnectionStatuses = peerConnectStatus
    this.disconnectRequested = disconnectRequested
    this.startFrame = startFrame
    this.ackFrame = ackFrame
    this.bytes = bytes
  }
}

export class InputAck {
  ackFrame: Frame

  constructor(ackFrame = NULL_FRAME) {
    this.ackFrame = ackFrame
  }
}

export type QualityReport = {
  frameAdvantage: number // frame advantage of other player
  ping: number
}

export type QualityReply = {
  pong: number
}

export type MessageHeader = {
  sendCount: number
  magic: number
}

export type MessageBody = ADT<{
  syncRequest: { syncRequest: SyncRequest }
  syncResponse: { syncResponse: SyncResponse }
  input: { input: Input }
  inputAck: { inputAck: InputAck }
  qualityReport: { qualityReport: QualityReport }
  qualityReply: { qualityReply: QualityReply }
  keepAlive: {}
}>

export type Message = {
  header: MessageHeader
  body: MessageBody
}
