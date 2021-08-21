import { PeerJsSocket } from "./peerjs-socket"
import { Frame, NULL_FRAME, PlayerIndex, SPECTATOR_PLAYER_INDEX_FROM } from "../lib"
import {
  ConnectionStatus,
  Input,
  InputAck,
  Message,
  MessageBody,
  MessageHeader,
  QualityReply,
  QualityReport,
  SyncRequest,
  SyncResponse
} from "./packet"
import { GameInput } from "../frame-info"
import { TimeSync } from "../time-sync"
import { Option } from "fp-ts/Option"
import { NetworkStats } from "./network-stats"
import { either, nonEmptyArray, option, string } from "fp-ts"
import { pipe } from "fp-ts/function"
import { match } from "ts-adt"
import { decode, encode } from "./compression"
import { assert } from "../assert"
import {
  DEFAULT_DISCONNECT_NOTIFY_START_MILLISECONDS,
  DEFAULT_DISCONNECT_TIMEOUT_MILLISECONDS,
  PeerJsSessionEvent
} from "../sessions/peerjs-session"

const UDP_HEADER_SIZE = 28 // Size of IP + UDP headers
const NUM_SYNC_PACKETS = 5
const UDP_SHUTDOWN_TIMER = 5000
const PENDING_OUTPUT_SIZE = 128
const SYNC_RETRY_INTERVAL: Duration = 200
const RUNNING_RETRY_INTERVAL: Duration = 200
const KEEP_ALIVE_INTERVAL: Duration = 200
const QUALITY_REPORT_INTERVAL: Duration = 200
const MAX_PAYLOAD: number = 467 // 512 is max safe UDP payload, minus 45 bytes for the rest of the packet
const FRAME_RATE = 60

export enum ProtocolState {
  Initializing,
  Synchronizing,
  Running,
  Disconnected,
  Shutdown
}

// TODO performance vs actual types?
export type Instant = number
export type Duration = number

export class PeerJsProtocol {
  remotePlayerIndex: PlayerIndex
  magic: number

  sendQueue: Array<Message>
  eventQueue: Array<PeerJsSessionEvent>

  // state
  state: ProtocolState
  syncRemainingRoundtrips: number
  syncRandomRequest: number
  runningLastQualityReport: Instant // TODO or Date?
  runningLastInputReceived: Instant // TODO or Date?
  disconnectNotifySent: boolean
  disconnectEventSent: boolean

  // constants
  disconnectTimeout: Duration
  disconnectNotifyStart: Duration
  shutdownTimeout: Instant

  // other client
  socket: PeerJsSocket
  remotePeerId: string
  remoteMagic: number
  peerConnectionStatuses: Array<ConnectionStatus>

  // input
  pendingOutput: Array<GameInput>
  lastReceivedInput: GameInput
  lastAckedInput: GameInput

  // time sync
  timeSyncLayer: TimeSync
  localFrameAdvantage: number
  remoteFrameAdvantage: number

  // network
  statsStartTime: number
  packetsSent: number
  bytesSent: number
  roundTripTime: number
  lastSentTime: Instant
  lastReceiveTime: Instant

  static partialEq(one: PeerJsProtocol, other: PeerJsProtocol) {
    return one.remotePlayerIndex === other.remotePlayerIndex
  }

  constructor(
    remotePeerId: string,
    remotePlayerIndex: PlayerIndex,
    socket: PeerJsSocket,
    numPlayers: number,
    inputSize: number
  ) {
    const magic = Math.random() * (Number.MAX_SAFE_INTEGER - 1) + 1
    const peerConnectionStatus = nonEmptyArray.makeBy(i => new ConnectionStatus())(numPlayers)

    const blankInputWithSize = new GameInput()
    blankInputWithSize.size = inputSize

    this.remotePlayerIndex = remotePlayerIndex
    this.magic = magic
    this.sendQueue = []
    this.eventQueue = []

    const now = performance.now()

    // state
    this.state = ProtocolState.Initializing
    this.syncRemainingRoundtrips = NUM_SYNC_PACKETS
    this.syncRandomRequest = (Math.random() * 2) ^ 31
    this.runningLastQualityReport = now
    this.runningLastInputReceived = now
    this.disconnectNotifySent = false
    this.disconnectEventSent = false

    // constants
    this.disconnectTimeout = DEFAULT_DISCONNECT_TIMEOUT_MILLISECONDS
    this.disconnectNotifyStart = DEFAULT_DISCONNECT_NOTIFY_START_MILLISECONDS
    this.shutdownTimeout = now

    // the other client
    this.socket = socket
    this.remotePeerId = remotePeerId
    this.remoteMagic = 0
    this.peerConnectionStatuses = peerConnectionStatus

    // input compression
    // TODO how to manage fixed size array and push
    this.pendingOutput = []
    this.lastReceivedInput = blankInputWithSize
    this.lastAckedInput = blankInputWithSize

    // time sync
    this.timeSyncLayer = new TimeSync()
    this.localFrameAdvantage = 0
    this.remoteFrameAdvantage = 0

    // network
    this.statsStartTime = 0
    this.packetsSent = 0
    this.bytesSent = 0
    this.roundTripTime = 0
    this.lastSentTime = now
    this.lastReceiveTime = now
  }

  updateLocalFrameAdvantage = (localFrame: Frame) => {
    if (localFrame === NULL_FRAME) return

    if (this.lastReceivedInput.frame === NULL_FRAME) return

    // Estimate which frame the other client is on by looking at the last frame they gave us plus some delta for the packet roundtrip time.
    const ping = this.roundTripTime
    const remoteFrame = this.lastReceivedInput.frame + (ping * FRAME_RATE) / 1000

    // Our frame "advantage" is how many frames behind the remote client we are. (It's an advantage because they will have to predict more often)
    this.localFrameAdvantage = remoteFrame - localFrame
  }

  setDisconnectTimeout = (newTimeout: Duration) => {
    this.disconnectTimeout = newTimeout
  }

  setDisconnectNotifyStart = (notifyStart: Duration) => {
    this.disconnectNotifyStart = notifyStart
  }

  networkStats = (): Option<NetworkStats> => {
    if (this.state !== ProtocolState.Initializing && this.state !== ProtocolState.Running) {
      return option.none
    }

    const now = performance.now()
    const totalBytesSent = this.bytesSent + this.packetsSent * UDP_HEADER_SIZE
    const seconds = (now - this.statsStartTime) / 1000
    const bps = totalBytesSent / seconds

    return option.some({
      ping: this.roundTripTime,
      sendQueueLength: this.pendingOutput.length,
      kbpsSent: bps / 1024,
      localFrameAdvantage: this.localFrameAdvantage,
      remoteFrameAdvantage: this.remoteFrameAdvantage
    })
  }

  isSynchronized = (): boolean =>
    this.state === ProtocolState.Running ||
    this.state === ProtocolState.Disconnected ||
    this.state === ProtocolState.Shutdown

  isRunning = (): boolean => this.state === ProtocolState.Running

  isHandlingMessage = () => null

  peerConnectionStatus = (handle: PlayerIndex) => this.peerConnectionStatuses[handle]

  disconnect = () => {
    if (this.state === ProtocolState.Shutdown) {
      return
    }

    this.state = ProtocolState.Disconnected
    // schedule the timeout which will lead to shutdown
    this.shutdownTimeout = Date.now() + UDP_SHUTDOWN_TIMER
  }

  synchronize = () => {
    assert(this.state === ProtocolState.Initializing)
    this.state = ProtocolState.Synchronizing
    this.syncRemainingRoundtrips = NUM_SYNC_PACKETS
    this.statsStartTime = Date.now()
    this.sendSyncRequest()
  }

  recommendFrameDelay = (requireIdleInput: boolean): number =>
    this.timeSyncLayer.recommendFrameDelay(requireIdleInput)

  poll = (connectionStatuses: ConnectionStatus[]): PeerJsSessionEvent[] => {
    const now = performance.now()

    switch (this.state) {
      case ProtocolState.Synchronizing:
        if (this.lastSentTime + SYNC_RETRY_INTERVAL < now) {
          this.sendSyncRequest()
        }
        break
      case ProtocolState.Running:
        // resend pending inputs, if some time has passed without sending or receiving inputs
        if (this.runningLastInputReceived + RUNNING_RETRY_INTERVAL < now) {
          this.sendPendingOutput(connectionStatuses)
          this.runningLastInputReceived = performance.now()
        }

        // periodically send a quality report
        if (this.runningLastQualityReport + QUALITY_REPORT_INTERVAL < now) {
          this.sendQualityReport()
        }

        // send keep alive packet if we didn't send a packet for some time
        if (this.lastSentTime + KEEP_ALIVE_INTERVAL < now) {
          this.sendKeepAlive()
        }

        // trigger a NetworkInterrupted event if we didn't receive a packet for some time
        if (!this.disconnectNotifySent && this.lastReceiveTime + this.disconnectNotifyStart < now) {
          const duration = this.disconnectTimeout - this.disconnectNotifyStart
          this.eventQueue.push({ _type: "networkInterrupted", disconnectTimeout: duration })
          this.disconnectNotifySent = true
        }

        // if we pass the disconnect_timeout threshold, send an event to disconnect
        if (!this.disconnectEventSent && this.lastReceiveTime + this.disconnectTimeout < now) {
          this.eventQueue.push({ _type: "disconnected" })
          this.disconnectEventSent = true
        }
        break

      case ProtocolState.Disconnected:
        if (this.shutdownTimeout < performance.now()) {
          this.state = ProtocolState.Shutdown
        }
        break
      case ProtocolState.Initializing:
        break
      case ProtocolState.Shutdown:
        break
    }

    const eventQueueCopy = [...this.eventQueue]
    this.eventQueue = []
    return eventQueueCopy
  }

  popPendingOutput = (ackFrame: Frame) => {
    let maybeInput: GameInput | undefined = this.pendingOutput[0]
    while (maybeInput !== undefined) {
      if (maybeInput.frame <= ackFrame) {
        this.lastAckedInput = maybeInput
        this.pendingOutput.shift()
        maybeInput = this.pendingOutput[0]
      } else {
        break
      }
    }
    console.log("popped")
  }

  /*
   *  SENDING MESSAGES
   */

  sendAllMessages = (socket: PeerJsSocket) => {
    console.log(
      `${socket.peer.id}, sending all messages, ${this.peerConnectionStatuses[0].lastFrame}`
    )
    if (this.state === ProtocolState.Shutdown) {
      this.sendQueue = []
      return
    }

    for (const msg of this.sendQueue) {
      socket.sendTo(this.remotePeerId, msg)
    }
    this.sendQueue = []
  }

  sendInput = (input: GameInput, connectStatuses: ConnectionStatus[]) => {
    if (this.state !== ProtocolState.Running) {
      return
    }

    // register the input and advantages in the time sync layer
    this.timeSyncLayer.advanceFrame(input, this.localFrameAdvantage, this.remoteFrameAdvantage)

    this.pendingOutput.push(input)
    if (this.pendingOutput.length > PENDING_OUTPUT_SIZE) {
      if (this.remotePlayerIndex >= SPECTATOR_PLAYER_INDEX_FROM) {
        // if this is a spectator that didn't ack our input, we just disconnect them
        this.eventQueue.push({ _type: "disconnected" })
      } else {
        // we should never have so much pending input for a remote player (if they didn't ack, we should stop at MAX_PREDICTION_THRESHOLD)
        assert(this.pendingOutput.length <= PENDING_OUTPUT_SIZE)
      }
    }

    this.sendPendingOutput(connectStatuses)
  }

  sendPendingOutput = (connectionStatuses: ConnectionStatus[]) => {
    const body = new Input()

    pipe(
      option.fromNullable(this.pendingOutput[0]),
      option.fold(
        () => {
          body.startFrame = 0
        },
        input => {
          assert(
            this.lastAckedInput.frame === NULL_FRAME ||
              this.lastAckedInput.frame + 1 === input.frame
          )
          body.startFrame = input.frame
        }
      )
    )

    // encode all pending inputs to a byte buffer
    body.bytes = encode(this.lastAckedInput, this.pendingOutput)

    // the byte buffer should not exceed a certain size to guarantee a maximum UDP packet size
    assert(body.bytes.length <= MAX_PAYLOAD)

    body.ackFrame = this.lastReceivedInput.frame
    body.disconnectRequested = this.state === ProtocolState.Disconnected
    body.peerConnectionStatuses = connectionStatuses

    this.queueMessage({ _type: "input", input: body })
  }

  sendInputAck = () => {
    this.queueMessage({ _type: "inputAck", inputAck: { ackFrame: this.lastReceivedInput.frame } })
  }

  sendKeepAlive = () => {
    this.queueMessage({ _type: "keepAlive" })
  }

  sendSyncRequest = () => {
    this.syncRandomRequest = Math.random() * Number.MAX_SAFE_INTEGER + 1
    this.queueMessage({
      _type: "syncRequest",
      syncRequest: { randomRequest: this.syncRandomRequest }
    })
  }

  sendQualityReport = () => {
    const now = Date.now()
    this.runningLastQualityReport = now
    this.queueMessage({
      _type: "qualityReport",
      qualityReport: { ping: now, frameAdvantage: this.localFrameAdvantage }
    })
  }

  queueMessage = (body: MessageBody) => {
    const header = { magic: this.magic, sendCount: -1 }
    const msg = { header, body }

    this.packetsSent += 1
    this.lastSentTime = Date.now()

    // TODO encoding and size, assume worst case until then
    this.bytesSent += 512
    this.sendQueue.push(msg)
  }

  /*
   *  RECEIVING MESSAGES
   */

  handleMessage = (msg: Message) => {
    console.log(`[${this.socket.peer.id}] handle msg: ${msg.body._type}`, msg)
    // don't handle messages if shutdown
    if (this.state === ProtocolState.Shutdown) return

    // filter packets that don't match the magic if we have set it already
    if (this.remoteMagic !== 0 && msg.header.magic !== this.remoteMagic) {
      return
    }

    // update time when we last received packages
    this.lastReceiveTime = Date.now()

    // if the connection has been marked as interrupted, send an event to signal we are receiving again
    if (this.disconnectNotifySent && this.state === ProtocolState.Running) {
      this.disconnectNotifySent = false
      this.eventQueue.push({ _type: "networkResumed" })
    }

    pipe(
      msg.body,
      match({
        syncRequest: ({ syncRequest }) => this.onSyncRequest(syncRequest),
        syncResponse: ({ syncResponse }) => this.onSyncResponse(msg.header, syncResponse),
        input: ({ input }) => this.onInput(input),
        inputAck: ({ inputAck }) => this.onInputAck(inputAck),
        qualityReport: ({ qualityReport }) => this.onQualityReport(qualityReport),
        qualityReply: ({ qualityReply }) => this.onQualityReply(qualityReply),
        keepAlive: () => {}
      })
    )
  }

  // Upon receiving a `SyncRequest`, answer with a `SyncReply` with the proper data
  onSyncRequest = (body: SyncRequest) => {
    this.queueMessage({
      _type: "syncResponse",
      syncResponse: { randomResponse: body.randomRequest }
    })
  }

  // Upon receiving a `SyncReply`, check validity and either
  // continue the synchronization process or conclude synchronization.
  onSyncResponse = (header: MessageHeader, body: SyncResponse) => {
    // ignore sync replies when not syncing
    if (this.state !== ProtocolState.Synchronizing) {
      return
    }

    // this is not the correct reply
    if (this.syncRandomRequest !== body.randomResponse) {
      return
    }

    // the sync reply is good, so we send a sync request again until
    // we have finished the required roundtrips.
    // Then, we can conclude the syncing process.
    this.syncRemainingRoundtrips -= 1
    if (this.syncRemainingRoundtrips > 0) {
      // register an event
      const event: PeerJsSessionEvent = {
        _type: "synchronizing",
        total: NUM_SYNC_PACKETS,
        count: NUM_SYNC_PACKETS - this.syncRemainingRoundtrips
      }
      this.eventQueue.push(event)
      // send another sync request
      this.sendSyncRequest()
    } else {
      // switch to running state
      this.state = ProtocolState.Running

      // register an event
      this.eventQueue.push({ _type: "synchronized" })

      // the remote endpoint is now "authorized"
      this.remoteMagic = header.magic
    }
  }

  onInput = (body: Input) => {
    // drop pending outputs until the ack frame
    this.popPendingOutput(body.ackFrame)

    // console.debug(`[ onInput (1)] Start frame: ${body.startFrame}`)

    // update the peer connection status
    if (body.disconnectRequested) {
      if (this.state !== ProtocolState.Disconnected && !this.disconnectEventSent) {
        this.eventQueue.push({ _type: "disconnected" })
        this.disconnectEventSent = true
      }
    } else {
      // update the peer connection status
      for (let i = 0; i < this.peerConnectionStatuses.length; i++) {
        this.peerConnectionStatuses[i].disconnected =
          body.peerConnectionStatuses[i].disconnected || this.peerConnectionStatuses[i].disconnected
        this.peerConnectionStatuses[i].lastFrame = Math.max(
          this.peerConnectionStatuses[i].lastFrame,
          body.peerConnectionStatuses[i].lastFrame
        )
      }
    }

    // this input has not been encoded with what we expect, so we drop the whole thing
    // TODO: this could be made so much more efficient if we kept more received input history
    // so we can properly decode with the right reference
    assert(
      this.lastReceivedInput.frame === NULL_FRAME ||
        this.lastReceivedInput.frame + 1 >= body.startFrame
    )

    // console.debug(`[ onInput (2)] Start frame: ${body.startFrame}`)

    if (
      this.lastReceivedInput.frame !== NULL_FRAME &&
      this.lastReceivedInput.frame + 1 !== body.startFrame
    ) {
      // console.debug(
      //   `[ onInput (ret)] last: ${this.lastReceivedInput.frame}, ignoring ${body.startFrame}`
      // )
      return
    }

    this.runningLastInputReceived = Date.now()

    // we know everything is correct, so we decode
    const eitherReceivedInputs = decode(this.lastReceivedInput, body.startFrame, body.bytes)

    // console.debug(`[ onInput (3)] Start frame: ${body.startFrame}`)

    pipe(
      eitherReceivedInputs,
      either.fold(
        _ => {},
        receivedInputs => {
          for (const receivedInput of receivedInputs) {
            if (receivedInput.frame <= this.lastReceivedInput.frame) {
              continue
            }
            // send the input to the session
            this.lastReceivedInput = GameInput.clone(receivedInput)
            // console.debug(
            //   `[ protocol ] add input to event queue, frame ${this.lastReceivedInput.frame}`
            // )
            this.eventQueue.push({ _type: "input", gameInput: receivedInput })
          }
          // send an input ack
          this.sendInputAck()
        }
      )
    )
  }

  // Upon receiving a `InputAck`, discard the oldest buffered input including the acked input.
  onInputAck = (body: InputAck) => {
    console.log(`pop pending, acc ${body.ackFrame}`, this.pendingOutput)
    this.popPendingOutput(body.ackFrame)
    console.log(`popped pending, acc ${body.ackFrame}`, this.pendingOutput)
  }

  onQualityReport = (body: QualityReport) => {
    this.remoteFrameAdvantage = body.frameAdvantage
    this.queueMessage({ _type: "qualityReply", qualityReply: { pong: body.ping } })
  }

  onQualityReply = (body: QualityReply) => {
    const millis = Date.now()
    assert(millis >= body.pong)
    this.roundTripTime = millis - body.pong
  }
}
