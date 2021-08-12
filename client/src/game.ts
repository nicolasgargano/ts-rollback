import { math, v2 } from "./math"
import { GameSettings } from "./settings"
import { Rapier } from "./hooks/useRapier"
import { RigidBody, Vector2, World } from "@dimforge/rapier2d-compat"

export type Input = {
  up: boolean
  right: boolean
  down: boolean
  left: boolean
  jump: boolean
}

export type GameState = {
  one: {}
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

export const step =
  (gs: GameSettings, world: World, oneRb: RigidBody, twoRb: RigidBody) =>
  (oneIn: Input, twoIn: Input) => {
    playerMovement(gs, oneRb, oneIn)
    // playerMovement(gs, twoRb, twoIn)
    world.step()
  }

const roundCuboidDimensions = {
  width: 1,
  height: 1,
  cornerRadius: 0.01
}

export const init: (rapier: Rapier) => [World, typeof step, RigidBody, RigidBody] = (
  rapier: Rapier
) => {
  const playerColliderDesc = rapier.ColliderDesc.cuboid(
    roundCuboidDimensions.width,
    roundCuboidDimensions.height
  )

  const world = new rapier.World({ x: 0.0, y: -9.81 })

  // Create One
  const one = world.createRigidBody(rapier.RigidBodyDesc.newDynamic().setTranslation(-10.0, 2.0))
  world.createCollider(playerColliderDesc, one.handle)

  // Create Two
  const two = world.createRigidBody(rapier.RigidBodyDesc.newDynamic().setTranslation(10.0, 2.0))
  world.createCollider(playerColliderDesc, two.handle)

  // Create the ground
  let groundColliderDesc = rapier.ColliderDesc.cuboid(20, 0.25)
  world.createCollider(groundColliderDesc)

  return [world, step, one, two]
}
