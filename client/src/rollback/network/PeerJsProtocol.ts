import { PeerJsSocket } from "./peerjs-socket"
import {
  ConnectionStatus,
  Input,
  InputAck,
  Message,
  MessageBody,
  MessageHeader,
  QualityReply,
  QualityReport,
  startingConnectionStatus,
  SyncRequest,
  SyncResponse
} from "./packet"
import { Option } from "fp-ts/Option"
import { NetworkStats } from "./network-stats"
import { either, nonEmptyArray, option, string } from "fp-ts"
import { pipe } from "fp-ts/function"
import { match } from "ts-adt"
import { compression } from "./compression"
import { assert } from "../assert"
import { PeerJsSessionEvent } from "../peerjs-session/peer-js-session-event"
import { Frame, isNullFrame, NULL_FRAME, PlayerIndex } from "../types"
import { SerializedGameInput } from "../SerializedGameInput"
import { AllSettings, defaults, NetworkSettings } from "../defaults"
import { timeSync, TimeSyncData } from "../sync/time-sync"

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
  settings: AllSettings
  playerIndex: PlayerIndex
  magic: number

  sendQueue: Array<Message>
  eventQueue: Array<PeerJsSessionEvent>

  // state
  state: ProtocolState
  syncRemainingRoundTrips: number
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
  pendingOutput: Array<SerializedGameInput>
  lastReceivedInput: SerializedGameInput
  lastAckedInput: SerializedGameInput
  inputSize: number

  // time sync
  timeSync: TimeSyncData
  localFrameAdvantage: number
  remoteFrameAdvantage: number

  // network
  statsStartTime: number
  packetsSent: number
  bytesSent: number
  roundTripTime: number
  lastSentTime: Instant
  lastReceiveTime: Instant

  constructor(
    peerId: string,
    playerIndex: PlayerIndex,
    socket: PeerJsSocket,
    targetNumPlayers: number,
    inputSize: number
  ) {
    this.settings = defaults

    const magic = Math.random() * (Number.MAX_SAFE_INTEGER - 1) + 1
    const peerConnectionStatus = nonEmptyArray.makeBy(_ => startingConnectionStatus())(
      targetNumPlayers
    )

    const blankInputWithSize = new SerializedGameInput(
      NULL_FRAME,
      inputSize,
      new Uint8Array(inputSize)
    )

    this.playerIndex = playerIndex
    this.magic = magic
    this.sendQueue = []
    this.eventQueue = []

    const now = performance.now()

    // state
    this.state = ProtocolState.Initializing
    this.syncRemainingRoundTrips = this.settings.net.NUM_SYNC_PACKETS
    this.syncRandomRequest = (Math.random() * 2) ^ 31
    this.runningLastQualityReport = now
    this.runningLastInputReceived = now
    this.disconnectNotifySent = false
    this.disconnectEventSent = false

    // constants
    this.disconnectTimeout = this.settings.net.DEFAULT_DISCONNECT_TIMEOUT_MILLISECONDS
    this.disconnectNotifyStart = this.settings.net.DEFAULT_DISCONNECT_NOTIFY_START_MILLISECONDS
    this.shutdownTimeout = now

    // the other client
    this.socket = socket
    this.remotePeerId = peerId
    this.remoteMagic = 0
    this.peerConnectionStatuses = peerConnectionStatus

    // input compression
    // TODO how to manage fixed size array and push
    this.pendingOutput = []
    this.lastReceivedInput = blankInputWithSize
    this.lastAckedInput = blankInputWithSize
    this.inputSize = inputSize

    // time sync
    this.timeSync = timeSync.make(this.settings.timeSync)
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

  /*








    -- OPERATIONS








   */

  updateLocalFrameAdvantage = (localFrame: Frame) => {
    if (isNullFrame(localFrame)) return
    if (isNullFrame(this.lastReceivedInput.frame)) return

    // Estimate which frame the other client is on by looking at the last frame they gave us plus some delta for the packet roundtrip time.
    const ping = this.roundTripTime
    const remoteFrame = this.lastReceivedInput.frame + (ping * this.settings.net.FRAME_RATE) / 1000

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
    const totalBytesSent = this.bytesSent + this.packetsSent * this.settings.net.UDP_HEADER_SIZE
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
    this.shutdownTimeout = performance.now() + this.settings.net.UDP_SHUTDOWN_TIMER
  }

  synchronize = () => {
    assert.truthy(this.state === ProtocolState.Initializing)
    this.state = ProtocolState.Synchronizing
    this.syncRemainingRoundTrips = this.settings.net.NUM_SYNC_PACKETS
    this.statsStartTime = performance.now()
    this.sendSyncRequest()
  }

  recommendFrameDelay = (requireIdleInput: boolean): number =>
    timeSync.recommendFrameDelay(requireIdleInput)(this.timeSync, this.settings.timeSync)

  loop = (connectionStatuses: ConnectionStatus[]): PeerJsSessionEvent[] => {
    const now = performance.now()

    switch (this.state) {
      case ProtocolState.Synchronizing:
        if (this.lastSentTime + this.settings.net.SYNC_RETRY_INTERVAL < now) {
          this.sendSyncRequest()
        }
        break
      case ProtocolState.Running:
        // resend pending inputs, if some time has passed without sending or receiving inputs
        if (this.runningLastInputReceived + this.settings.net.RUNNING_RETRY_INTERVAL < now) {
          this.sendPendingOutput(connectionStatuses)
          this.runningLastInputReceived = now
        }

        // periodically send a quality report
        if (this.runningLastQualityReport + this.settings.net.QUALITY_REPORT_INTERVAL < now) {
          this.sendQualityReport()
        }

        // send keep alive packet if we didn't send a packet for some time
        if (this.lastSentTime + this.settings.net.KEEP_ALIVE_INTERVAL < now) {
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

  popPendingUntilFrame = (ackFrame: Frame) => {
    let maybeInput: SerializedGameInput | undefined = this.pendingOutput[0]
    while (maybeInput !== undefined) {
      if (maybeInput.frame <= ackFrame) {
        this.lastAckedInput = maybeInput
        this.pendingOutput.shift()
        maybeInput = this.pendingOutput[0]
      } else {
        break
      }
    }
  }

  /*








    -- SENDING MESSAGES








   */

  sendAllMessages = (socket: PeerJsSocket) => {
    // console.log(
    //   `${socket.peer.id}, sending all messages, ${this.peerConnectionStatuses[0].lastFrame}`
    // )
    if (this.state === ProtocolState.Shutdown) {
      this.sendQueue = []
      return
    }

    for (const msg of this.sendQueue) {
      socket.sendTo(this.remotePeerId, msg)
    }
    this.sendQueue = []
  }

  sendInput = (input: SerializedGameInput, connectStatuses: ConnectionStatus[]) => {
    if (this.state !== ProtocolState.Running) return

    // register the input and advantages in the time sync layer
    timeSync.advanceFrame(
      input,
      this.localFrameAdvantage,
      this.remoteFrameAdvantage
    )(this.timeSync, this.settings.timeSync)

    this.pendingOutput.push(input)
    if (this.pendingOutput.length > this.settings.net.PENDING_OUTPUT_SIZE) {
      // if this is a spectator that didn't ack our input, we just disconnect them
      if (this.playerIndex >= this.settings.SPECTATOR_INDEX_FROM)
        this.eventQueue.push({ _type: "disconnected" })
      // we should never have so much pending input for a remote player (if they didn't ack, we should stop at MAX_PREDICTION_THRESHOLD)
      else assert.truthy(this.pendingOutput.length <= this.settings.net.PENDING_OUTPUT_SIZE)
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
          assert.truthy(
            this.lastAckedInput.frame === NULL_FRAME ||
              this.lastAckedInput.frame + 1 === input.frame
          )
          body.startFrame = input.frame
        }
      )
    )

    // encode all pending inputs to a byte buffer
    body.bytes = compression.encode(this.lastAckedInput, this.pendingOutput)

    // the byte buffer should not exceed a certain size to guarantee a maximum UDP packet size
    assert.truthy(body.bytes.length <= this.settings.net.MAX_PAYLOAD)

    body.ackFrame = this.lastReceivedInput.frame
    body.disconnectRequested = this.state === ProtocolState.Disconnected
    body.peerConnectionStatuses = connectionStatuses

    if (body.bytes.length > 0) this.queueMessage({ _type: "input", input: body })
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
    const now = performance.now()
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
    this.lastSentTime = performance.now()

    // TODO encoding and size, assume worst case until then
    this.bytesSent += 512
    this.sendQueue.push(msg)
  }

  /*






   -- RECEIVING MESSAGES






  */

  handleMessage = (msg: Message) => {
    // console.log(`[${this.socket.peer.id}] handle msg: ${msg.body._type}`, msg)
    // don't handle messages if shutdown
    if (this.state === ProtocolState.Shutdown) return

    // ignore messages that don't match the magic if we have set it already
    if (this.remoteMagic !== 0 && msg.header.magic !== this.remoteMagic) {
      return
    }
    this.lastReceiveTime = performance.now()

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
    if (this.state !== ProtocolState.Synchronizing) return

    // this is not the correct reply
    if (this.syncRandomRequest !== body.randomResponse) return

    // the sync reply is good, so we send a sync request again until
    // we have finished the required roundtrips.
    // Then, we can conclude the syncing process.
    this.syncRemainingRoundTrips--
    if (this.syncRemainingRoundTrips > 0) {
      // register an event
      const event: PeerJsSessionEvent = {
        _type: "synchronizing",
        total: this.settings.net.NUM_SYNC_PACKETS,
        count: this.settings.net.NUM_SYNC_PACKETS - this.syncRemainingRoundTrips
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
    this.popPendingUntilFrame(body.ackFrame)

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
    assert.truthy(
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

    this.runningLastInputReceived = performance.now()

    // we know everything is correct, so we decode
    const eitherDecoded = compression.decode(this.lastReceivedInput, body.startFrame, body.bytes)

    // console.debug(`[ onInput (3)] Start frame: ${body.startFrame}`)

    pipe(
      eitherDecoded,
      either.fold(
        _ => {},
        receivedInputs => {
          for (const receivedInput of receivedInputs) {
            if (receivedInput.frame <= this.lastReceivedInput.frame) continue
            this.lastReceivedInput = SerializedGameInput.clone(receivedInput)
            this.eventQueue.push({ _type: "input", input: receivedInput })
          }
          this.sendInputAck()
        }
      )
    )
  }

  onInputAck = (body: InputAck) => {
    this.popPendingUntilFrame(body.ackFrame)
  }

  onQualityReport = (body: QualityReport) => {
    this.remoteFrameAdvantage = body.frameAdvantage
    this.queueMessage({ _type: "qualityReply", qualityReply: { pong: body.ping } })
  }

  onQualityReply = (body: QualityReply) => {
    const millis = performance.now()
    assert.truthy(millis >= body.pong)
    this.roundTripTime = millis - body.pong
  }
}
