import { ADT } from "ts-adt"
import { useEffect, useState } from "react"
import RAPIER from "@dimforge/rapier2d-compat"
import { Buffer } from "buffer"

export type Rapier = typeof RAPIER

export type RapierStatus = ADT<{
  loading: {}
  error: { msg: string }
  done: { rapier: Rapier }
}>

export const useRapier = () => {
  const [status, setStatus] = useState<RapierStatus>({ _type: "loading" })
  useEffect(() => {
    // polyfill buffer
    globalThis.Buffer = Buffer

    RAPIER.init()
      .then(() => {
        setStatus({ _type: "done", rapier: RAPIER })
      })
      .catch((err: any) => {
        setStatus({ _type: "error", msg: err.toString() })
      })
  }, [])
  return status
}
