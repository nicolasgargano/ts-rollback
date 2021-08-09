import { GameInput } from "./frame-info"
import { MAX_PLAYERS, NULL_FRAME, PlayerType } from "./lib"

export const Default: {
  PlayerType: () => PlayerType
} = {
  PlayerType: () => ({ _type: "local" })
}
