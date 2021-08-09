import { ConsoleGame } from "../../console-game-p2p"
import Peer from "peerjs"
import { useEffect } from "react"
import React from "react"
import { SessionState } from "../../../../lib"

export const ConsoleGameWindow = (props: {
  peer: Peer
  game: ConsoleGame | undefined
  remotePeerId?: string
}) => {
  const init = () => {}

  useEffect(init, [])
  if (props.game === undefined) {
    return (
      <div>
        remote id:{" "}
        {props.remotePeerId ? `connecting to... ${props.remotePeerId}` : `I need a remote peer id`}
      </div>
    )
  } else {
    return (
      <div>
        <div>
          <h3>Players</h3>
          {Array.from(props.game.peerJsSession.players.entries())
            .sort(compareByField("0"))
            .map(([idx, player]) => (
              <p key={`player_type_${props.peer.id}-${idx}`}>
                {idx}: {player._type}
              </p>
            ))}
        </div>
        <div>
          <h3>Data</h3>
          <p>{SessionState[props.game.peerJsSession.currentState()]}</p>
          {Array.from(props.game.peerJsSession.players.entries())
            .sort(compareByField("0"))
            .map(([idx, player]) => (
              <pre key={`net_stats_${props.peer.id}-${idx}`}>
                {JSON.stringify(props.game?.peerJsSession.networkStats(idx), null, 2)}
              </pre>
            ))}
        </div>
        <div>
          <h3>Game State</h3>
          <pre>{JSON.stringify(props.game.model, null, 2)}</pre>
        </div>
      </div>
    )
  }
}

function compareByField(fieldName: string) {
  return (a: any, b: any) => (a[fieldName] > b[fieldName] ? 1 : -1)
}
