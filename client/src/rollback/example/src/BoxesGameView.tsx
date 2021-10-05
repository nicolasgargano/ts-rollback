import { GameState } from "./boxes-game"
import React from "react"
import { GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"

export const BoxesGameView = (props: { gamestate: GameState }) => {
  const { one, two } = props.gamestate
  return (
    <Canvas camera={{ position: [0, 0, 10] }}>
      <ambientLight intensity={0.5} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
      <pointLight position={[-10, -10, -10]} />
      <OrbitControls />
      <Reference />
      <mesh position={[one.x, one.y, 0]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      <mesh position={[two.x, two.y, 0]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial color="blue" />
      </mesh>
    </Canvas>
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
    </GizmoHelper>
  )
}
