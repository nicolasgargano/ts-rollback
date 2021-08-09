import {
  Frame,
  GGRSEvent,
  GGRSRequest,
  NULL_FRAME,
  PlayerIndex,
  PlayerType,
  SessionState,
  SPECTATOR_PLAYER_INDEX_FROM
} from "../lib"
import { ADT, match } from "ts-adt"
import { Option } from "fp-ts/Option"
import { pipe } from "fp-ts/function"
import { either, nonEmptyArray, option } from "fp-ts"
import { GameInput } from "../frame-info"
import { SyncLayer } from "../sync"
import { GGRSError } from "../error"
import { Either } from "fp-ts/Either"
import { ConnectionStatus } from "../network/packet"
import { PeerJsSocket } from "../network/peerjs-socket"
import { Duration, PeerJsProtocol } from "../network/peerjs-protocol"
import { NetworkStats } from "../network/network-stats"
import Peer from "peerjs"
import { assert } from "../assert"

export const RECOMMENDATION_INTERVAL: Frame = 40
export const MAX_EVENT_QUEUE_SIZE: number = 100
export const DEFAULT_DISCONNECT_TIMEOUT_MILLISECONDS = 2000
export const DEFAULT_DISCONNECT_NOTIFY_START_MILLISECONDS = 500

export type Player = ADT<{
  local: {}
  remote: { conn: PeerJsProtocol }
  spectator: { conn: PeerJsProtocol }
}>

const playerAsConnection = (player: Player): Option<PeerJsProtocol> =>
  pipe(
    player,
    match({
      local: () => option.none,
      remote: ({ conn }) => option.some(conn),
      spectator: ({ conn }) => option.some(conn)
    })
  )

const remoteAsConnection = (player: Player): Option<PeerJsProtocol> =>
  pipe(
    player,
    match({
      local: () => option.none,
      remote: ({ conn }) => option.some(conn),
      spectator: ({ conn }) => option.none
    })
  )

const spectatorAsConnection = (player: Player): Option<PeerJsProtocol> =>
  pipe(
    player,
    match({
      local: () => option.none,
      remote: ({ conn }) => option.none,
      spectator: ({ conn }) => option.some(conn)
    })
  )

export type PeerJsSessionEvent = ADT<{
  synchronizing: { total: number; count: number }
  synchronized: {}
  input: { gameInput: GameInput }
  disconnected: {}
  networkInterrupted: { disconnectTimeout: number }
  networkResumed: {}
}>

export class PeerJsSession {
  numPlayers: number
  inputSize: number
  syncLayer: SyncLayer

  disconnectTimeout: number
  disconnectNotifyStart: number
  disconnectFrame: number

  state: SessionState

  socket: PeerJsSocket
  players: Map<PlayerIndex, Player>
  localConnectionStatus: Array<ConnectionStatus>

  nextSpectatorFrame: Frame
  nextRecommendedSleep: Frame

  eventQueue: Array<GGRSEvent>

  constructor(numPlayers: number, inputSize: number, peer: Peer) {
    const localConnectionStatus = nonEmptyArray
      .range(0, numPlayers - 1)
      .map(_ => new ConnectionStatus())

    this.numPlayers = numPlayers
    this.inputSize = inputSize
    this.syncLayer = new SyncLayer(numPlayers, inputSize)
    this.disconnectTimeout = DEFAULT_DISCONNECT_TIMEOUT_MILLISECONDS
    this.disconnectNotifyStart = DEFAULT_DISCONNECT_NOTIFY_START_MILLISECONDS
    this.disconnectFrame = NULL_FRAME
    this.state = SessionState.Initializing
    this.socket = new PeerJsSocket(peer, (from, msg) => {
      const protocols: PeerJsProtocol[] = Array.from(this.players.values())
        .map(playerAsConnection)
        .filter(option.isSome)
        .map(a => a.value)
      const fromProtocol = protocols.find(e => e.remotePeerId === from)
      if (fromProtocol !== undefined) {
        try {
          fromProtocol.handleMessage(msg)
        } catch (e) {
          console.warn("Unhandled msg", msg, e)
        }
      } else {
        throw `No endpoint found for peer id ${from}`
      }
    })
    this.players = new Map()
    this.localConnectionStatus = localConnectionStatus
    this.nextSpectatorFrame = 0
    this.nextRecommendedSleep = 0
    this.eventQueue = new Array()
  }

  /// Must be called for each player in the session (e.g. in a 3 player session, must be called 3 times) before starting the session. Returns the player handle
  /// used by GGRS to represent that player internally. The player handle will be the same you provided for players, but `player_handle + 1000` for spectators.
  /// You will need the player handle to add input, change parameters or disconnect the player or spectator.
  ///
  /// # Errors
  /// - Returns `InvalidHandle` when the provided player handle is too big for the number of players
  /// - Returns `InvalidRequest` if a player with that handle has been added before
  /// - Returns `InvalidRequest` if the session has already been started
  /// - Returns `InvalidRequest` when adding more than one local player
  addPlayer = (
    playerType: PlayerType,
    playerHandle: PlayerIndex
  ): Either<GGRSError, PlayerIndex> => {
    // currently, you can only add players in the init phase
    if (this.state !== SessionState.Initializing) {
      return either.left<GGRSError, PlayerIndex>({
        _type: "invalidRequest",
        info: "Session already started. You can only add players before starting the session."
      })
    } else {
      // add the player depending on type
      return pipe(
        playerType,
        match({
          local: () => this.addLocalPlayer(playerHandle),
          remote: ({ peerId }) => this.addRemotePlayer(playerHandle, peerId),
          spectator: ({ peerId }) => this.addSpectator(playerHandle, peerId)
        })
      )
    }
  }

  // After you are done defining and adding all players, you should start the session. Then, the synchronization process will begin.
  // # Errors
  // - Returns `InvalidRequest` if the session has already been started or if insufficient players have been registered.
  startSession = (): Either<GGRSError, null> => {
    // if we are not in the initialization state, we already started the session at some point
    if (this.state !== SessionState.Initializing) {
      return either.left({ _type: "invalidRequest", info: "Session already started." })
    } else if (
      // check if all players are added
      nonEmptyArray
        .range(0, this.numPlayers - 1)
        .some(playerIndex => this.players.get(playerIndex) === undefined)
    ) {
      return either.left({
        _type: "invalidRequest",
        info: "Not enough players have been added. Keep registering players up to the defined player number."
      })
    } else {
      // start the synchronisation
      this.state = SessionState.Synchronizing
      for (const p of this.players.values()) {
        pipe(
          playerAsConnection(p),
          option.fold(
            () => {},
            c => c.synchronize()
          )
        )
      }
      return either.right(null)
    }
  }

  /// Disconnects a remote player from a game.
  /// # Errors
  /// - Returns `InvalidRequest` if you try to disconnect a player who has already been disconnected or if you try to disconnect a local player.
  disconnectPlayer = (playerIndex: PlayerIndex): Either<GGRSError, null> => {
    const maybePlayer = option.fromNullable(this.players.get(playerIndex))
    return pipe(
      maybePlayer,
      option.fold(
        () => either.left<GGRSError, null>({ _type: "invalidRequest", info: "" }),
        p =>
          pipe(
            p,
            match({
              local: () =>
                either.left<GGRSError, null>({
                  _type: "invalidRequest",
                  info: "Local Player cannot be disconnected."
                }),
              // a remote player can only be disconnected if not already disconnected, since there is some additional logic attached
              remote: _ => {
                if (!this.localConnectionStatus[playerIndex].disconnected) {
                  const lastFrame = this.localConnectionStatus[playerIndex].lastFrame
                  this.disconnectPlayerAtFrame(playerIndex, lastFrame)
                  return either.right(null)
                } else {
                  return either.left<GGRSError, null>({ _type: "playerDisconnected" })
                }
              },
              // disconnecting spectators is simpler
              spectator: _ => {
                this.disconnectPlayerAtFrame(playerIndex, NULL_FRAME)
                return either.right(null)
              }
            })
          )
      )
    )
  }

  /// You should call this to notify GGRS that you are ready to advance your gamestate by a single frame.
  /// Returns an order-sensitive `Vec<GGRSRequest>`. You should fulfill all requests in the exact order they are provided.
  /// Failure to do so will cause panics later.
  ///
  /// # Errors
  /// - Returns `InvalidHandle` if the provided player handle is higher than the number of players.
  /// - Returns `InvalidRequest` if the provided player handle refers to a remote player.
  /// - Returns `NotSynchronized` if the session is not yet ready to accept input. In this case, you either need to start the session or wait for synchronization between clients.
  advanceFrame = (
    localPlayerIndex: PlayerIndex,
    localInput: Uint8Array
  ): Either<GGRSError, GGRSRequest[]> => {
    // receive info from remote players, trigger events and send messages
    this.pollRemoteClients()

    // player handle is invalid
    if (localPlayerIndex > this.numPlayers) {
      return either.left({ _type: "invalidHandle" })
    }

    // player is not a local player
    if (this.players.get(localPlayerIndex) === undefined) {
      return either.left({ _type: "invalidHandle" })
    }

    // session is not running and synchronized
    if (this.state !== SessionState.Running) {
      return either.left({ _type: "notSynchronized" })
    }

    const requests: GGRSRequest[] = []

    // check game consistency and rollback, if necessary
    pipe(
      option.fromNullable(this.syncLayer.checkSimulationConsistency(this.disconnectFrame)),
      option.fold(
        () => {},
        f => {
          this.adjustGamestate(f, requests)
          this.disconnectFrame = NULL_FRAME
        }
      )
    )

    // find the total minimum confirmed frame and propagate disconnects
    const minConfirmedFrame = this.minConfirmedFrame()

    // send confirmed inputs to remotes
    this.sendConfirmedInputsToSpectators(minConfirmedFrame)

    // set the last confirmed frame and discard all saved inputs before that frame
    this.syncLayer.setLastConfirmedFrame(minConfirmedFrame)

    // check time sync between clients and wait, if appropriate
    if (this.syncLayer.currentFrame > this.nextRecommendedSleep) {
      const skipFrames = this.maxDelayRecommendation(true)
      if (skipFrames > 0) {
        this.nextRecommendedSleep = this.syncLayer.currentFrame + RECOMMENDATION_INTERVAL
        this.eventQueue.push({ _type: "waitRecommendation", skipFrames: skipFrames })
      }
    }

    // create an input struct for current frame
    const gameInput = new GameInput(this.syncLayer.currentFrame, this.inputSize)
    gameInput.copyInput(localInput)

    // send the input into the sync layer
    const actualFrameEither = this.syncLayer.addLocalInput(localPlayerIndex, gameInput)

    const ret = pipe(
      actualFrameEither,
      either.fold(
        err => either.left(err),
        actualFrame => {
          // if the actual frame is the null frame, the frame has been dropped by the input queues (for example due to changed input delay)
          if (actualFrame !== NULL_FRAME) {
            // if not dropped, send the input to all other clients, but with the correct frame (influenced by input delay)
            gameInput.frame = actualFrame
            this.localConnectionStatus[localPlayerIndex].lastFrame = actualFrame

            for (const p of this.players.values()) {
              pipe(
                remoteAsConnection(p),
                option.fold(
                  () => {},
                  e => {
                    // send the input directly
                    e.sendInput(gameInput, this.localConnectionStatus)
                    e.sendAllMessages(this.socket)
                  }
                )
              )
            }
          }

          // save the current frame in the syncronization layer
          requests.push(this.syncLayer.saveCurrentState())
          // get correct inputs for the current frame
          const inputs = this.syncLayer.synchronizedInputs(this.localConnectionStatus)

          // check if input is correct or represents a disconnected player (by NULL_FRAME)
          inputs.forEach(i =>
            assert(i.frame === NULL_FRAME || i.frame === this.syncLayer.currentFrame)
          )

          // advance the frame
          this.syncLayer.advanceFrame()
          requests.push({ _type: "advanceFrame", inputs: inputs })

          return either.right<GGRSError, GGRSRequest[]>(requests)
        }
      )
    )
    return ret
  }

  /// Should be called periodically by your application to give GGRS a chance to do internal work.
  /// GGRS will receive UDP packets, distribute them to corresponding endpoints, handle all occurring events and send all outgoing UDP packets.
  pollRemoteClients = () => {
    // skipping polling because we use callback
    // --
    // update frame information between remote players
    for (const p of this.players.values()) {
      pipe(
        remoteAsConnection(p),
        option.fold(
          () => {},
          endpoint => {
            if (endpoint.isRunning()) {
              endpoint.updateLocalFrameAdvantage(this.syncLayer.currentFrame)
            }
          }
        )
      )
    }

    // run enpoint poll and get events from players and spectators. This will trigger additional UDP packets to be sent.
    const events: Array<[PeerJsSessionEvent, PlayerIndex]> = []
    for (const p of this.players.values()) {
      pipe(
        playerAsConnection(p),
        option.fold(
          () => {},
          endpoint => {
            endpoint.poll(this.localConnectionStatus).forEach(ev => {
              events.push([ev, endpoint.remotePlayerIndex])
            })
          }
        )
      )
    }

    events.forEach(([ev, playerIndex]) => {
      this.handleEvent(ev, playerIndex)
    })

    for (const p of this.players.values()) {
      pipe(
        playerAsConnection(p),
        option.fold(
          () => {},
          endpoint => {
            endpoint.sendAllMessages(this.socket)
          }
        )
      )
    }
  }

  /// Returns a `NetworkStats` struct that gives information about the quality of the network connection.
  /// # Errors
  /// - Returns `InvalidHandle` if the provided player handle does not refer to an existing remote player.
  /// - Returns `NotSynchronized` if the session is not connected to other clients yet.
  networkStats = (playerIndex: PlayerIndex): Either<GGRSError, NetworkStats> => {
    // player handle is invalid
    if (playerIndex > this.numPlayers) {
      return either.left({ _type: "invalidHandle" })
    }

    return pipe(
      option.fromNullable(this.players.get(playerIndex)),
      option.fold(
        () => either.left<GGRSError, NetworkStats>({ _type: "invalidHandle" }),
        p =>
          pipe(
            p,
            match({
              local: () =>
                either.left<GGRSError, NetworkStats>({ _type: "invalidRequest", info: "TODO" }),
              remote: ({ conn }) =>
                pipe(
                  conn.networkStats(),
                  option.fold(
                    () => either.left<GGRSError, NetworkStats>({ _type: "notSynchronized" }),
                    stats => either.right<GGRSError, NetworkStats>(stats)
                  )
                ),
              spectator: ({ conn }) =>
                pipe(
                  conn.networkStats(),
                  option.fold(
                    () => either.left<GGRSError, NetworkStats>({ _type: "notSynchronized" }),
                    stats => either.right<GGRSError, NetworkStats>(stats)
                  )
                )
            })
          )
      )
    )
  }

  /// Change the amount of frames GGRS will delay the inputs for a player. You should only set the frame delay for local players.
  /// # Errors
  /// - Returns `InvalidHandle` if the provided player handle is invalid.
  /// - Returns `InvalidRequest` if the provided player handle does not refer to a local player.
  setFrameDelay = (frameDelay: number, playerIndex: PlayerIndex): Either<GGRSError, null> => {
    // player handle is invalid
    if (playerIndex > this.numPlayers) {
      return either.left({ _type: "invalidHandle" })
    }

    return pipe(
      option.fromNullable(this.players.get(playerIndex)),
      option.fold(
        () => either.left({ _type: "invalidHandle" }),
        p =>
          pipe(
            p,
            match({
              local: () => {
                this.syncLayer.setFrameDelay(playerIndex, frameDelay)
                return either.right<GGRSError, null>(null)
              },
              remote: _ =>
                either.left<GGRSError, null>({
                  _type: "invalidRequest",
                  info: "Frame delay can only be set for the local player."
                }),
              spectator: _ =>
                either.left<GGRSError, null>({
                  _type: "invalidRequest",
                  info: "Frame delay can only be set for the local player."
                })
            })
          )
      )
    )
  }

  /// Sets the disconnect timeout. The session will automatically disconnect from a remote peer if it has not received a packet in the timeout window.
  setDisconnectTimeout = (timeout: Duration) => {
    for (const p of this.players.values()) {
      pipe(
        playerAsConnection(p),
        option.fold(
          () => {},
          e => {
            e.setDisconnectTimeout(timeout)
          }
        )
      )
    }
  }

  /// Sets the time before the first notification will be sent in case of a prolonged period of no received packages.
  setDisconnectNotifyDelay = (notifyDelay: Duration) => {
    for (const p of this.players.values()) {
      pipe(
        playerAsConnection(p),
        option.fold(
          () => {},
          e => {
            e.setDisconnectNotifyStart(notifyDelay)
          }
        )
      )
    }
  }

  /// Returns the current `SessionState` of a session.
  currentState = () => this.state

  /// Returns all events that happened since last queried for events. If the number of stored events exceeds `MAX_EVENT_QUEUE_SIZE`, the oldest events will be discarded.
  drainEvents = () => {
    const ret = [...this.eventQueue]
    this.eventQueue = []
    return ret
  }

  addLocalPlayer = (playerIndex: PlayerIndex): Either<GGRSError, PlayerIndex> => {
    // check if valid player
    if (playerIndex >= this.numPlayers) {
      return either.left({ _type: "invalidHandle" })
    }

    // check if player handle already exists
    if (this.players.has(playerIndex)) {
      return either.left({ _type: "invalidRequest", info: "Player handle already exists." })
    }

    // check if a local player already exists
    for (const p of this.players.values()) {
      pipe(
        p,
        match({
          local: () => {
            return either.left({
              _type: "invalidRequest",
              info: "Local player already registered. It is not possible to add more than one local player."
            })
          },
          remote: _ => {},
          spectator: _ => {}
        })
      )
    }

    // finally add the local player
    this.players.set(playerIndex, { _type: "local" })
    return either.right(playerIndex)
  }

  addRemotePlayer = (playerIndex: PlayerIndex, peerId: string): Either<GGRSError, PlayerIndex> => {
    // check if valid player
    if (playerIndex >= this.numPlayers) {
      return either.left({ _type: "invalidHandle" })
    }

    // check if player handle already exists
    if (this.players.has(playerIndex)) {
      return either.left({ _type: "invalidRequest", info: "Player handle already exists." })
    }

    // create a udp protocol endpoint that handles all the messaging to that remote player
    const endpoint = new PeerJsProtocol(
      peerId,
      playerIndex,
      this.socket,
      this.numPlayers,
      this.inputSize
    )
    endpoint.setDisconnectNotifyStart(this.disconnectNotifyStart)
    endpoint.setDisconnectTimeout(this.disconnectTimeout)

    // if the input delay has been set previously, erase it (remote players handle input delay at their end)
    this.syncLayer.setFrameDelay(playerIndex, 0)

    // add the remote player
    this.players.set(playerIndex, { _type: "remote", conn: endpoint })
    return either.right(playerIndex)
  }

  addSpectator = (playerIndex: PlayerIndex, peerId: string): Either<GGRSError, PlayerIndex> => {
    const spectatorIndex = playerIndex + SPECTATOR_PLAYER_INDEX_FROM

    // check if player handle already exists
    if (this.players.has(spectatorIndex)) {
      return either.left({ _type: "invalidRequest", info: "Player handle already exists." })
    }

    // create a peerjs protocol endpoint that handles all the messaging to that remote spectator
    const endpoint = new PeerJsProtocol(
      peerId,
      spectatorIndex,
      this.socket,
      this.numPlayers,
      this.inputSize
    )
    endpoint.setDisconnectNotifyStart(this.disconnectNotifyStart)
    endpoint.setDisconnectTimeout(this.disconnectTimeout)

    // add the spectator
    this.players.set(spectatorIndex, { _type: "spectator", conn: endpoint })
    return either.right(spectatorIndex)
  }

  disconnectPlayerAtFrame = (playerIndex: PlayerIndex, lastFrame: Frame) => {
    // disconnect the remote player
    pipe(
      option.fromNullable(this.players.get(playerIndex)),
      option.fold(
        () => {
          throw "Invalid player handle"
        },
        p => {
          pipe(
            p,
            match({
              local: () => {},
              remote: ({ conn }) => {
                conn.disconnect()

                // mark the player as disconnected
                this.localConnectionStatus[playerIndex].disconnected = true

                if (this.syncLayer.currentFrame > lastFrame) {
                  // remember to adjust simulation to account for the fact that the player disconnected a few frames ago,
                  // resimulating with correct disconnect flags (to account for user having some AI kick in).
                  this.disconnectFrame = lastFrame + 1
                }
              },
              spectator: ({ conn }) => {
                conn.disconnect()
              }
            })
          )
        }
      )
    )
    // check if all remotes are synchronized now
    this.checkInitialSync()
  }

  /// Change the session state to `SessionState::Running` if all UDP endpoints are synchronized.
  checkInitialSync = () => {
    // if we are not synchronizing, we don't need to do anything
    if (this.state !== SessionState.Synchronizing) {
      return
    }

    // if any remote player is not synchronized, we continue synchronizing
    for (const p of this.players.values()) {
      pipe(
        playerAsConnection(p),
        option.fold(
          () => {},
          endpoint => {
            if (!endpoint.isSynchronized()) {
              return
            }
          }
        )
      )
    }

    // everyone is synchronized, so we can change state and accept input
    this.state = SessionState.Running
  }

  /// Roll back to `first_incorrect` frame and resimulate the game with most up-to-date input data.
  adjustGamestate = (firstIncorrect: Frame, requests: GGRSRequest[]) => {
    const currentFrame = this.syncLayer.currentFrame
    const count = currentFrame - firstIncorrect

    // rollback to the first incorrect state
    requests.push(this.syncLayer.loadFrame(firstIncorrect))
    this.syncLayer.resetPrediction(firstIncorrect)
    assert(this.syncLayer.currentFrame === firstIncorrect)

    // step forward to the previous current state
    for (let i = 0; i < count; i++) {
      const inputs = this.syncLayer.synchronizedInputs(this.localConnectionStatus)

      if (i > 0) {
        requests.push(this.syncLayer.saveCurrentState())
      }

      this.syncLayer.advanceFrame()
      requests.push({ _type: "advanceFrame", inputs: inputs })
    }

    assert(this.syncLayer.currentFrame === currentFrame)
  }

  /// For each spectator, send all confirmed input up until the minimum confirmed frame.
  sendConfirmedInputsToSpectators = (minConfirmedFrame: Frame) => {
    if (this.numSpectators() === 0) {
      return
    }

    while (this.nextSpectatorFrame <= minConfirmedFrame) {
      const inputs = this.syncLayer.confirmedInputs(
        this.nextSpectatorFrame,
        this.localConnectionStatus
      )
      assert(inputs.length === this.numPlayers)

      // construct a pseudo input containing input of all players for the spectators
      const spectatorInput = new GameInput(
        this.nextSpectatorFrame,
        this.inputSize * this.numPlayers
      )

      inputs.forEach((input, i) => {
        assert(input.frame === NULL_FRAME || input.frame === this.nextSpectatorFrame)
        assert(input.frame === NULL_FRAME || input.size === this.inputSize)
        const start = i * input.size
        const end = (i + 1) * input.size
        spectatorInput.buffer.set(input.input(), start)
      })

      // send it off
      for (const p of this.players.values()) {
        pipe(
          spectatorAsConnection(p),
          option.fold(
            () => {},
            endpoint => {
              if (endpoint.isRunning()) {
                endpoint.sendInput(spectatorInput, this.localConnectionStatus)
              }
            }
          )
        )
      }

      // onto the next frame
      this.nextSpectatorFrame += 1
    }
  }

  /// For each player, find out if they are still connected and what their minimum confirmed frame is.
  /// Disconnects players if the remote clients have disconnected them already.
  minConfirmedFrame = (): Frame => {
    let totalMinConfirmed = Number.MAX_SAFE_INTEGER

    for (let playerIndex = 0; playerIndex < this.numPlayers; playerIndex++) {
      let queueConnected = true
      let queueMinConfirmed = Number.MAX_SAFE_INTEGER

      // check all remote players for that player
      for (const p of this.players.values()) {
        pipe(
          remoteAsConnection(p),
          option.fold(
            () => {},
            endpoint => {
              if (endpoint.isRunning()) {
                const connStatus = endpoint.peerConnectionStatus(playerIndex)
                const connected = !connStatus.disconnected
                const minConfirmed = connStatus.lastFrame

                queueConnected = queueConnected && connected
                queueMinConfirmed = Math.min(queueMinConfirmed, minConfirmed)
              }
            }
          )
        )
      }

      // check the local status for that player
      const localConnected = !this.localConnectionStatus[playerIndex].disconnected
      const localMinConfirmed = this.localConnectionStatus[playerIndex].lastFrame

      if (localConnected) {
        queueMinConfirmed = Math.min(queueMinConfirmed, localMinConfirmed)
      }

      if (queueConnected) {
        totalMinConfirmed = Math.min(queueMinConfirmed, totalMinConfirmed)
      } else {
        // check to see if the remote disconnect is further back than we have disconnected that player.
        // If so, we need to re-adjust. This can happen when we e.g. detect our own disconnect at frame n
        // and later receive a disconnect notification for frame n-1.
        if (localConnected || localMinConfirmed > queueMinConfirmed) {
          this.disconnectPlayerAtFrame(playerIndex, queueMinConfirmed)
        }
      }
    }

    assert(totalMinConfirmed < Number.MAX_SAFE_INTEGER)
    return totalMinConfirmed
  }

  /// Gather delay recommendations from each remote client and return the maximum.
  maxDelayRecommendation = (requireIdleInput: boolean): number => {
    let interval = 0
    for (const [playerIndex, p] of this.players.entries()) {
      pipe(
        remoteAsConnection(p),
        option.fold(
          () => {},
          endpoint => {
            if (this.localConnectionStatus[playerIndex].disconnected) {
              interval = Math.max(interval, endpoint.recommendFrameDelay(requireIdleInput))
            }
          }
        )
      )
    }
    return interval
  }

  /// Handle events received from the UDP endpoints. Most events are being forwarded to the user for notification, but some require action.
  handleEvent = (event: PeerJsSessionEvent, playerIndex: PlayerIndex) => {
    pipe(
      event,
      match({
        // forward to user
        synchronizing: ({ total, count }) => {
          this.eventQueue.push({ _type: "synchronizing", playerHandle: playerIndex, total, count })
        },
        // forward to user
        networkInterrupted: ({ disconnectTimeout }) => {
          this.eventQueue.push({
            _type: "networkInterrupted",
            playerHandle: playerIndex,
            disconnectTimeout
          })
        },
        // forward to user
        networkResumed: () => {
          this.eventQueue.push({ _type: "networkResumed", playerHandle: playerIndex })
        },
        // check if all remotes are synced, then forward to user
        synchronized: () => {
          this.checkInitialSync()
          this.eventQueue.push({ _type: "synchronized", playerHandle: playerIndex })
        },
        // disconnect the player, then forward to user
        disconnected: () => {
          // for remote players
          const lastFrame =
            playerIndex < this.numPlayers
              ? this.localConnectionStatus[playerIndex].lastFrame
              : NULL_FRAME

          this.disconnectPlayerAtFrame(playerIndex, lastFrame)
          this.eventQueue.push({ _type: "disconnected", playerHandle: playerIndex })
        },
        // add the input and all associated information
        input: ({ gameInput }) => {
          // input only comes from remote players, not spectators
          assert(playerIndex < this.numPlayers)
          if (!this.localConnectionStatus[playerIndex].disconnected) {
            // check if the input comes in the correct sequence
            const currentRemoteFrame = this.localConnectionStatus[playerIndex].lastFrame
            assert(currentRemoteFrame === NULL_FRAME || currentRemoteFrame + 1 === gameInput.frame)
            // update our info
            this.localConnectionStatus[playerIndex].lastFrame = gameInput.frame
            // add the remote input
            this.syncLayer.addRemoteInput(playerIndex, gameInput)
          }
        }
      })
    )

    // check event queue size and discard oldest events if too big
    while (this.eventQueue.length > MAX_EVENT_QUEUE_SIZE) {
      this.eventQueue.shift()
    }
  }

  /// Return the number of spectators currently registered
  numSpectators = () =>
    Array.from(this.players.values()).filter(p => pipe(spectatorAsConnection(p), option.isSome))
      .length
}
