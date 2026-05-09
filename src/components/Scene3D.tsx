'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float, Stars, Torus } from '@react-three/drei';
import * as THREE from 'three';

function FloatingOrb() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x = state.clock.elapsedTime * 0.15;
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
  });

  return (
    <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.8}>
      <mesh ref={meshRef}>
        <Sphere args={[1.4, 128, 128]}>
          <MeshDistortMaterial
            color="#2563eb"
            attach="material"
            distort={0.45}
            speed={2}
            roughness={0.1}
            metalness={0.8}
            emissive="#1d4ed8"
            emissiveIntensity={0.3}
          />
        </Sphere>
      </mesh>
    </Float>
  );
}

function OrbitRing({ radius, speed, color }: { radius: number; speed: number; color: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.z = state.clock.elapsedTime * speed;
    groupRef.current.rotation.x = Math.PI / 3;
  });

  return (
    <group ref={groupRef}>
      <Torus args={[radius, 0.015, 16, 200]}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.35}
          emissive={color}
          emissiveIntensity={0.6}
        />
      </Torus>
      <mesh position={[radius, 0, 0]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}

// Positions générées une seule fois en dehors du composant pour être stables
const PARTICLE_COUNT = 180;
const PARTICLE_POSITIONS = (() => {
  const arr = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    arr[i * 3] = (Math.random() - 0.5) * 14;
    arr[i * 3 + 1] = (Math.random() - 0.5) * 14;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 14;
  }
  return arr;
})();

function ParticleField() {
  const positions = useMemo(() => PARTICLE_POSITIONS, []);

  const pointsRef = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.04;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#60a5fa" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

export default function Scene3D({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[6, 6, 6]} intensity={2} color="#60a5fa" />
        <pointLight position={[-6, -6, -6]} intensity={1} color="#818cf8" />
        <spotLight position={[0, 8, 0]} intensity={1.5} color="#ffffff" />

        <FloatingOrb />
        <OrbitRing radius={2.4} speed={0.5} color="#3b82f6" />
        <OrbitRing radius={3.2} speed={-0.3} color="#818cf8" />
        <ParticleField />
        <Stars radius={30} depth={50} count={800} factor={3} saturation={0.5} fade speed={0.5} />
      </Canvas>
    </div>
  );
}
