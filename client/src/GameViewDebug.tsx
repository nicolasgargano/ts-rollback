import React, { useRef } from "react"
import { Cuboid, RigidBody, ShapeType, World } from "@dimforge/rapier2d-compat"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei"
import { log } from "./helpers"

export const GameViewDebug = (props: { game: [World, any, RigidBody, RigidBody] }) => {
  const [world, , oneRb, twoRb] = props.game

  return (
    <Canvas>
      <DebugScene world={world} />
    </Canvas>
  )
}

const DebugScene = ({ world }: { world: World }) => {
  const cuboidMeshes: JSX.Element[] = []
  const c: Cuboid = new Cuboid(1, 1)
  world.forEachCollider(c => {
    switch (c.shapeType()) {
      case ShapeType.Cuboid:
        const halfExtents = c.halfExtents()
        const pos = c.translation()
        const rot = c.rotation()
        cuboidMeshes.push(
          <mesh key={c.handle} position={[pos.x, pos.y, 0]} rotation={[0, 0, rot]}>
            <boxGeometry args={[halfExtents.x * 2, halfExtents.y * 2, halfExtents.x * 2]} />
            <meshStandardMaterial wireframe color="#00ff00" />
          </mesh>
        )
    }
  })

  return (
    <>
      <hemisphereLight intensity={1} />
      <color attach="background" args={["#000"]} />
      <OrbitControls />
      <Reference />
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      {cuboidMeshes}
    </>
  )
}

const Reference = () => {
  return (
    <GizmoHelper
      alignment="bottom-right" // widget alignment within scene
      margin={[80, 80]} // widget margins (X, Y)
      onUpdate={() => {}}
    >
      <GizmoViewport axisColors={["red", "green", "blue"]} labelColor="white" />
      {/* alternative: <GizmoViewcube /> */}
    </GizmoHelper>
  )
}
