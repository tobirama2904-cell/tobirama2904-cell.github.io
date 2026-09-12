'use client';
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

function Core({ level }: { level: number }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame((_, dt) => {
    mesh.current.rotation.y += dt * 0.4;
    mesh.current.rotation.x += dt * 0.13;
    const s = 1 + Math.sin(Date.now() / 500) * 0.03 + level * 0.25;
    mesh.current.scale.setScalar(s);
    mat.current.emissiveIntensity = 0.9 + level * 2.2;
  });
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1.15, 5), []);
  return <Float speed={2.4} rotationIntensity={0.6} floatIntensity={1.4}>
    <mesh ref={mesh} geometry={geo}>
      <meshStandardMaterial ref={mat} color="#0b5fff" emissive="#0b5fff" emissiveIntensity={1} roughness={0.25} metalness={0.7} wireframe={false} />
    </mesh>
    <mesh geometry={geo} scale={1.35}>
      <meshBasicMaterial color="#7aa8ff" wireframe transparent opacity={0.14} />
    </mesh>
  </Float>;
}
export function Orb({ level = 0, className = '' }: { level?: number; className?: string }) {
  return <div className={className}>
    <Canvas camera={{ position: [0, 0, 4.2], fov: 50 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.7} />
      <pointLight position={[5, 5, 5]} intensity={2} color="#7aa8ff" />
      <pointLight position={[-5, -3, 2]} intensity={1.2} color="#ff6b35" />
      <Core level={level} />
      <Sparkles count={70} scale={6} size={2.4} speed={0.5} color="#7aa8ff" opacity={0.7} />
    </Canvas>
  </div>;
}
