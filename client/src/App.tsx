import React, { useEffect } from "react"
import { Connection } from "./Connection"
import { GameComponent } from "./GameComponent"
import { useRapier, RapierStatus, Rapier } from "./hooks/useRapier"
import { pipe } from "fp-ts/function"
import { match } from "ts-adt"
import { GameP2PComponent } from "./GameP2PComponent"

export const App = () => {
  const rapierStatus = useRapier()

  return pipe(
    rapierStatus,
    match({
      loading: () => <div>Loading...</div>,
      error: ({ msg }) => <div>Woops! {msg}</div>,
      done: ({ rapier }) => <GameP2PComponent rapier={rapier} />
    })
  )
}
