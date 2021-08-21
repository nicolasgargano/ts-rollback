import { math, v2 } from "./math"
import { GameSettings } from "./settings"
import { Rapier } from "./hooks/useRapier"
import {
  Cuboid,
  Ray,
  RayColliderToi,
  RigidBody,
  RigidBodyHandle,
  ShapeColliderTOI,
  Vector2,
  World
} from "@dimforge/rapier2d-compat"
import { pipe } from "fp-ts/function"
import { log } from "./helpers"
import { ADT, match } from "ts-adt"

export type Input = {
  up: boolean
  right: boolean
  down: boolean
  left: boolean
  jump: boolean
}

export type GameModelBase = {
  step: number
  oneScore: number
  twoScore: number
  oneHandle: RigidBodyHandle
  twoHandle: RigidBodyHandle
  castQueries: CastQuery[]
}

export type GameState = GameModelBase & {
  world: World
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
  gs.step++

  gs.world.step()

  const raysQty = 3
  const verticalRaysSpacing = playerDimensions.width / (raysQty - 1)

  const one = gs.world.getRigidBody(gs.oneHandle)
  const two = gs.world.getRigidBody(gs.twoHandle)

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

        const otherPlayerColliderHandle = collider.handle === 0 ? 1 : 0
        if (hit.colliderHandle === otherPlayerColliderHandle && hit.toi < 1) {
          if (collider.handle === 0) gs.oneScore++
          if (collider.handle === 1) gs.twoScore++

          one.setTranslation({ x: -10, y: 10 }, true)
          two.setTranslation({ x: 10, y: 10 }, true)
        }
      }
      // log("hit")([pos(), collider.halfExtents(), rayOrigin, hit])
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

  playerStep(one, oneIn)
  playerStep(two, twoIn)
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
  const oneCollider = world.createCollider(playerColliderDesc, one.handle)
  // log("One collider")(oneCollider)

  // Create Two
  const two = world.createRigidBody(rapier.RigidBodyDesc.newDynamic().setTranslation(10.0, 100))
  const twoCollider = world.createCollider(playerColliderDesc, two.handle)
  // log("Two collider")(twoCollider)

  // Create the ground
  let groundColliderDesc = rapier.ColliderDesc.cuboid(20, 2)
  const groundCollider = world.createCollider(groundColliderDesc)
  // log("Ground collider")(groundCollider)

  return {
    step: 0,
    world: world,
    oneHandle: one.handle,
    oneScore: 0,
    twoHandle: two.handle,
    twoScore: 0,
    castQueries: new Array()
  }
}
