import { ADT, match } from "ts-adt"
import { Option } from "fp-ts/Option"
import { pipe } from "fp-ts/function"
import { option } from "fp-ts"
import { PeerJsProtocol } from "../network/PeerJsProtocol"

export type Player = ADT<{
  local: {}
  remote: { conn: PeerJsProtocol }
  spectator: { conn: PeerJsProtocol }
}>

const protocol = (player: Player): Option<PeerJsProtocol> =>
  pipe(
    player,
    match({
      local: () => option.none,
      remote: ({ conn }) => option.some(conn),
      spectator: ({ conn }) => option.some(conn)
    })
  )

const remoteProtocol = (player: Player): Option<PeerJsProtocol> =>
  pipe(
    player,
    match({
      local: () => option.none,
      remote: ({ conn }) => option.some(conn),
      spectator: ({ conn }) => option.none
    })
  )

const spectatorProtocol = (player: Player): Option<PeerJsProtocol> =>
  pipe(
    player,
    match({
      local: () => option.none,
      remote: ({ conn }) => option.none,
      spectator: ({ conn }) => option.some(conn)
    })
  )

export const player = {
  asConnection: protocol,
  remoteAsConnection: remoteProtocol,
  spectatorAsConnection: spectatorProtocol
}
