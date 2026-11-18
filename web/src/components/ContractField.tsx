"use client";

import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { DoubleSide } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { edgeColor, layoutField, RATE_SCALE, X_SPAN, type LaidNode } from "@/lib/layout";
import type { ArtistField, Metric } from "@/lib/types";

const BASE = "#A78BFA";
const AMENDMENT = "#F2A33C";
const MISSING = "#5C5F66";
const CITE = "#6E9EE8";

type Props = {
  field: ArtistField[];
  metric: Metric;
  artistId: number | null;
  asOf: string;
  selectedId: number | null;
  citedIds: number[];
  onSelect: (contractId: number | null) => void;
  onHover: (contractId: number | null) => void;
};

function Frame({ center, eye }: { center: [number, number, number]; eye: [number, number, number] }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  useLayoutEffect(() => {
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.lookAt(center[0], center[1], center[2]);
    camera.updateProjectionMatrix();
    controls?.target.set(center[0], center[1], center[2]);
    controls?.update();
  }, [camera, controls, center, eye]);
  return null;
}

function Focus({ node }: { node: LaidNode | null }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const contractId = node?.contractId ?? null;
  useEffect(() => {
    if (!node || !controls) return;
    controls.target.set(node.position[0], node.position[1], node.position[2]);
    camera.position.set(node.position[0] + 5, node.position[1] + 3.5, node.position[2] + 7);
    controls.update();
  }, [camera, controls, contractId, node]);
  return null;
}

function NameTag({ position, children }: { position: [number, number, number]; children: string }) {
  return (
    <Billboard position={position}>
      <Text
        fontSize={0.46}
        color="#E6E7E9"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.025}
        outlineColor="#0B0C0E"
        raycast={() => null}
      >
        {children}
      </Text>
    </Billboard>
  );
}

function NodeMesh({
  node,
  size,
  selected,
  cited,
  onSelect,
  onHover,
}: {
  node: LaidNode;
  size: number;
  selected: boolean;
  cited: boolean;
  onSelect: (contractId: number) => void;
  onHover: (contractId: number | null) => void;
}) {
  const color = node.missing ? MISSING : node.kind === "BASE" ? BASE : AMENDMENT;
  return (
    <group position={node.position}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.contractId);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(node.contractId);
        }}
        onPointerOut={() => onHover(null)}
      >
        <sphereGeometry args={[node.radius * size, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={selected || cited ? color : "#000000"}
          emissiveIntensity={selected ? 0.9 : cited ? 0.5 : 0}
          wireframe={node.missing}
          roughness={0.42}
          metalness={0.04}
        />
      </mesh>
      {cited ? (
        <mesh>
          <sphereGeometry args={[node.radius * size * 1.9, 14, 14]} />
          <meshBasicMaterial color={CITE} wireframe />
        </mesh>
      ) : null}
    </group>
  );
}

export default function ContractField(props: Props) {
  const layout = useMemo(
    () => layoutField(props.field, props.metric, props.artistId),
    [props.field, props.metric, props.artistId],
  );
  const cited = useMemo(() => new Set(props.citedIds), [props.citedIds]);
  const eye = useMemo<[number, number, number]>(
    () => [layout.center[0] + 10, 18, layout.center[2] + Math.max(layout.depth * 0.45, 16)],
    [layout],
  );
  const selected = layout.nodes.find((node) => node.contractId === props.selectedId) ?? null;
  const showNames = layout.lanes.length > 0 && layout.lanes.length <= 24;
  const size = layout.lanes.length > 40 ? 2.2 : 1;
  const linked = useMemo(() => {
    const ids = new Set<number>();
    for (const edge of layout.edges) {
      ids.add(edge.edge.fromContractId);
      ids.add(edge.edge.toContractId);
    }
    return ids;
  }, [layout]);
  return (
    <Canvas camera={{ position: eye, fov: 42, near: 0.1, far: 4000 }} dpr={[1, 1.75]} onPointerMissed={() => props.onSelect(null)}>
      <color attach="background" args={["#0B0C0E"]} />
      <ambientLight intensity={0.74} />
      <directionalLight position={[28, 40, 14]} intensity={1.2} />
      <Frame center={layout.center} eye={eye} />
      <Focus node={selected} />
      <OrbitControls makeDefault enableDamping maxDistance={900} minDistance={1.5} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[X_SPAN / 2, -0.02, layout.depth / 2]}>
        <planeGeometry args={[X_SPAN + 8, Math.max(layout.depth + 4, 6)]} />
        <meshStandardMaterial color="#121316" roughness={1} metalness={0} />
      </mesh>
      {layout.years.map((year) => (
        <group key={year.iso}>
          <mesh position={[year.x, 0.02, layout.depth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.035, Math.max(layout.depth + 2, 2)]} />
            <meshBasicMaterial color="#34373F" />
          </mesh>
          <Text position={[year.x, 0.35, -1.6]} fontSize={0.55} color="#9A9DA3" anchorX="center" anchorY="middle">
            {year.iso.slice(0, 4)}
          </Text>
        </group>
      ))}
      <mesh position={[layout.xOf(props.asOf), 6, layout.depth / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[Math.max(layout.depth + 2, 2), 12]} />
        <meshBasicMaterial color="#6E9EE8" transparent opacity={0.12} depthWrite={false} side={DoubleSide} />
      </mesh>
      {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((mark) => (
        <Text key={mark} position={[-2.2, mark * RATE_SCALE, -1.2]} fontSize={0.4} color="#5C5F66" anchorX="right" anchorY="middle">
          {mark.toFixed(1)}
        </Text>
      ))}
      {showNames
        ? layout.lanes.map((lane) => (
            <Text key={lane.artistId} position={[-1.4, 0.2, lane.z]} fontSize={0.4} color="#9A9DA3" anchorX="right" anchorY="middle">
              {lane.name}
            </Text>
          ))
        : null}
      {layout.edges.map((edge) => (
        <group key={edge.key}>
          <Line points={[edge.from, edge.to]} color={edgeColor(edge.delta)} lineWidth={1.4} />
          <NameTag
            position={[
              (edge.from[0] + edge.to[0]) / 2,
              Math.max(edge.from[1], edge.to[1]) + 1.15,
              (edge.from[2] + edge.to[2]) / 2,
            ]}
          >
            {edge.artistName}
          </NameTag>
        </group>
      ))}
      {layout.nodes.map((node) =>
        linked.has(node.contractId) ? null : (
          <NameTag
            key={`name-${node.contractId}`}
            position={[node.position[0], node.position[1] + node.radius * size + 0.7, node.position[2]]}
          >
            {node.artistName}
          </NameTag>
        ),
      )}
      {layout.nodes.map((node) => (
        <NodeMesh
          key={node.contractId}
          node={node}
          size={size}
          selected={node.contractId === props.selectedId}
          cited={cited.has(node.contractId)}
          onSelect={props.onSelect}
          onHover={props.onHover}
        />
      ))}
    </Canvas>
  );
}
