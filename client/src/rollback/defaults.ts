import { Duration } from "./network/PeerJsProtocol"
import { Frame } from "../ggrs/lib"

export type NetworkSettings = {
  UDP_HEADER_SIZE: number // Size of IP + UDP headers
  NUM_SYNC_PACKETS: number
  UDP_SHUTDOWN_TIMER: number
  PENDING_OUTPUT_SIZE: number
  SYNC_RETRY_INTERVAL: number
  RUNNING_RETRY_INTERVAL: number
  KEEP_ALIVE_INTERVAL: number
  QUALITY_REPORT_INTERVAL: number
  MAX_PAYLOAD: number // 512 is max safe UDP payload, minus 45 bytes for the rest of the packet
  FRAME_RATE: number

  //
  RECOMMENDATION_INTERVAL: number
  MAX_EVENT_QUEUE_SIZE: number
  DEFAULT_DISCONNECT_TIMEOUT_MILLISECONDS: number
  DEFAULT_DISCONNECT_NOTIFY_START_MILLISECONDS: number
}

export type AllSettings = typeof defaults

export const defaults = {
  SPECTATOR_INDEX_FROM: 1000,
  FRAME_DELAY: 3,
  MAX_INPUT_BYTES: 8,
  MAX_PLAYERS: 4,
  MAX_PREDICTION_FRAMES: 16,
  peerjsSesstionSettings: {
    RECOMMENDATION_INTERVAL: 40,
    MAX_EVENT_QUEUE_SIZE: 100,
    DEFAULT_DISCONNECT_TIMEOUT_MILLISECONDS: 2000,
    DEFAULT_DISCONNECT_NOTIFY_START_MILLISECONDS: 500
  },
  timeSync: {
    FRAME_WINDOW_SIZE: 30,
    MIN_UNIQUE_FRAMES: 10,
    MIN_FRAME_ADVANTAGE: 3,
    MAX_FRAME_ADVANTAGE: 10
  },
  net: {
    UDP_HEADER_SIZE: 28, // Size of IP + UDP headers
    NUM_SYNC_PACKETS: 5,
    UDP_SHUTDOWN_TIMER: 5000,
    PENDING_OUTPUT_SIZE: 128,
    SYNC_RETRY_INTERVAL: 200,
    RUNNING_RETRY_INTERVAL: 200,
    KEEP_ALIVE_INTERVAL: 200,
    QUALITY_REPORT_INTERVAL: 200,
    MAX_PAYLOAD: 467, // 512 is max safe UDP payload, minus 45 bytes for the rest of the packet, FRAME_RATE = 60
    //
    RECOMMENDATION_INTERVAL: 40,
    MAX_EVENT_QUEUE_SIZE: 100,
    DEFAULT_DISCONNECT_TIMEOUT_MILLISECONDS: 2000,
    DEFAULT_DISCONNECT_NOTIFY_START_MILLISECONDS: 500,
    FRAME_RATE: 60
  }
}
