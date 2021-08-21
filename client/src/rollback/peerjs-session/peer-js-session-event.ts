import { ADT } from "ts-adt"
import { SerializedGameInput } from "../SerializedGameInput"

export type PeerJsSessionEvent = ADT<{
  synchronizing: { total: number; count: number }
  synchronized: {}
  input: { input: SerializedGameInput }
  disconnected: {}
  networkInterrupted: { disconnectTimeout: number }
  networkResumed: {}
}>
