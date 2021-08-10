import React from "react"
import { RigidBody, World } from "@dimforge/rapier2d-compat"

export const GameView = (props: { game: [World, any, RigidBody, RigidBody] }) => {
  const [world, , oneRb, twoRb] = props.game

  return (
    <div>
      {RigidbodyData(oneRb)}
      {RigidbodyData(twoRb)}
    </div>
  )
}

const RigidbodyData = (rb: RigidBody) => (
  <pre>
    {JSON.stringify(
      {
        pos: rb.translation(),
        linvel: rb.linvel(),
        angvel: rb.angvel()
      },
      null,
      2
    )}
  </pre>
)
