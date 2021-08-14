import React, { useRef } from "react"
import { Cuboid, RigidBody, ShapeType, World } from "@dimforge/rapier2d-compat"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, GizmoHelper, GizmoViewport, Line, Box, Text } from "@react-three/drei"
import { log } from "./helpers"
import { GameState } from "./game"
import { pipe } from "fp-ts/function"
import { v2 } from "./math"
import { plus } from "./math/v2"
import { match } from "ts-adt"

export const GameViewDebug = (props: { gamestate: GameState }) => {
  return (
    <Canvas>
      <DebugScene gamestate={props.gamestate} />
    </Canvas>
  )
}

const DebugScene = ({
  gamestate: { world, castQueries, oneScore, twoScore }
}: {
  gamestate: GameState
}) => {
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

  castQueries.forEach((query, i) => {
    pipe(
      query,
      match({
        raycast: ({ ray, maxToi, maybeHit }) => {
          const rayOrigin = ray.origin
          const maybeHitVector = maybeHit
            ? pipe(ray.dir, v2.scale(maybeHit.toi), plus(ray.origin))
            : null
          const rayDestination = pipe(ray.dir, v2.scale(maxToi), plus(ray.origin))

          if (maybeHitVector) {
            cuboidMeshes.push(
              <Line
                key={`raycast-debug-hit-${i}`}
                points={[
                  [rayOrigin.x, rayOrigin.y, 0],
                  [maybeHitVector.x, maybeHitVector.y, 0]
                ]}
                color="red"
              />,
              <Line
                key={`raycast-debug-dest-${i}`}
                points={[
                  [maybeHitVector.x, maybeHitVector.y, 0],
                  [rayDestination.x, rayDestination.y, 0]
                ]}
                color="white"
              />
            )
          } else {
            cuboidMeshes.push(
              <Line
                key={`raycast-debug-dest-${i}`}
                points={[
                  [rayOrigin.x, rayOrigin.y, 0],
                  [rayDestination.x, rayDestination.y, 0]
                ]}
                color="white"
              />
            )
          }
        },
        noRotationCuboidCast: ({ cuboid, from, dir, maxToi, maybeHit }) => {
          const xLength = cuboid.halfExtents.x
          const yLength = cuboid.halfExtents.y * 2 + maxToi
          const pos = pipe(dir, v2.scale(maxToi / 2), v2.plus(from))

          cuboidMeshes.push(
            <Box
              key={`debug-shapecast-${i}`}
              position={[pos.x, pos.y, 0]}
              args={[xLength, yLength, xLength]}
            >
              <meshPhongMaterial attach="material" color={maybeHit ? "red" : "white"} wireframe />
            </Box>
          )

          if (maybeHit) {
            const x = maybeHit.witness2.x
            const y = maybeHit.witness2.y

            cuboidMeshes.push(
              <Box key={`debug-shapecast-hit-${i}`} position={[x, y, 0]} args={[1, 1, 1]}>
                <meshPhongMaterial attach="material" color={"red"} />
              </Box>
            )
          }
        }
      })
    )
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
      <Text color="white" anchorX="center" anchorY="middle" fontSize={1} position={[-10, 10, 0]}>
        {oneScore}
      </Text>
      <Text color="white" anchorX="center" anchorY="middle" fontSize={1} position={[10, 10, 0]}>
        {twoScore}
      </Text>
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
