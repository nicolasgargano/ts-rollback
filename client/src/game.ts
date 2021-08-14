import { math, v2 } from "./math"
import { GameSettings } from "./settings"
import { Rapier } from "./hooks/useRapier"
import {
  Cuboid,
  Ray,
  RayColliderToi,
  RigidBody,
  ShapeColliderTOI,
  Vector2,
  World
} from "@dimforge/rapier2d-compat"
import { pipe } from "fp-ts/function"
import { log } from "./helpers"
import { ADT } from "ts-adt"

export type Input = {
  up: boolean
  right: boolean
  down: boolean
  left: boolean
  jump: boolean
}

export const playerMovement = (
  gs: GameSettings,
  rb: RigidBody,
  { up, right, down, left, jump }: Input
) => {
  if (right) {
    rb.applyForce({ x: 100, y: 0 }, true)
  }
  if (left) {
    rb.applyForce({ x: -100, y: 0 }, true)
  }
}

export type GameState = {
  world: World
  one: RigidBody
  two: RigidBody
  castQueries: CastQuery[]
}

export type CastQuery = ADT<{
  raycast: { ray: Ray; maxToi: number; maybeHit: RayColliderToi | null }
  noRotationCuboidCast: {
    cuboid: Cuboid
    from: Vector2
    dir: Vector2
    maxToi: number
    maybeHit: ShapeColliderTOI | null
  }
}>

export const step = (settings: GameSettings, gs: GameState) => (oneIn: Input, twoIn: Input) => {
  gs.castQueries = []

  gs.world.step()

  const raysQty = 3
  const verticalRaysSpacing = playerDimensions.width / (raysQty - 1)

  const playerStep = (rb: RigidBody, input: Input) => {
    const pos = () => rb.translation()
    const vel = () => rb.linvel()
    const raylength = Math.abs(vel().y) + playerDimensions.skinWidth
    const collider = gs.world.colliders.get(rb.collider(0))

    let collisionsBelow = false
    for (let i = 0; i < raysQty; i++) {
      const rayOrigin = pipe(
        pos(),
        v2.plus({ x: -playerDimensions.width / 2, y: -playerDimensions.height / 2 }),
        v2.plus({ x: verticalRaysSpacing * i, y: 0 })
      )
      const ray = new Ray(rayOrigin, v2.down)
      const hit = gs.world.castRay(ray, raylength, true, 0xffffffff)

      if (hit) {
        const hitDistance = hit.toi
        rb.setLinvel({ x: 0, y: (hitDistance - playerDimensions.skinWidth) * -1 }, true)
        collisionsBelow = true
      }
      log("hit")([pos(), collider.halfExtents(), rayOrigin, hit])
      gs.castQueries.push({ _type: "raycast", ray, maxToi: raylength, maybeHit: hit })
    }

    if (input.left) {
      rb.setLinvel({ x: -settings.playerSpeed, y: vel().y }, true)
    }
    if (input.right) {
      rb.setLinvel({ x: settings.playerSpeed, y: vel().y }, true)
    }
    if (input.jump && collisionsBelow) {
      rb.setLinvel({ x: vel().x, y: 10 }, true)
    }
  }

  playerStep(gs.one, oneIn)
  playerStep(gs.two, twoIn)
}

const playerDimensions = {
  width: 1,
  height: 1,
  skinWidth: 0.01
}

export const init: (rapier: Rapier) => GameState = (rapier: Rapier) => {
  const playerColliderDesc = rapier.ColliderDesc.cuboid(
    playerDimensions.width / 2 - playerDimensions.skinWidth,
    playerDimensions.height / 2 - playerDimensions.skinWidth
  ).setSensor(true)

  const world = new rapier.World({ x: 0.0, y: -9.81 })

  // Create One
  const one = world.createRigidBody(rapier.RigidBodyDesc.newDynamic().setTranslation(-10.0, 100))
  log("One collider")(world.createCollider(playerColliderDesc, one.handle))

  // Create Two
  const two = world.createRigidBody(rapier.RigidBodyDesc.newDynamic().setTranslation(10.0, 100))
  log("Two collider")(world.createCollider(playerColliderDesc, two.handle))

  // Create the ground
  let groundColliderDesc = rapier.ColliderDesc.cuboid(20, 10)
  log("Ground collider")(world.createCollider(groundColliderDesc))

  return {
    world: world,
    one: one,
    two: two,
    castQueries: new Array()
  }
}
