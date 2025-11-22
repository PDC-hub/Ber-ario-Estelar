
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Position } from '../types';

interface MatterStreamProps {
  sourcePos: Position;
  targetPos: Position;
  color: string;
  intensity: number; // Defines thickness and brightness
}

export const MatterStream: React.FC<MatterStreamProps> = ({ sourcePos, targetPos, color, intensity }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particleCount = 40;

  // Memoize dummy object for matrix updates
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    if (!meshRef.current) return;

    const t = state.clock.elapsedTime;
    const source = new THREE.Vector3(sourcePos.x, sourcePos.y, sourcePos.z);
    const target = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
    const distance = source.distanceTo(target);

    // Create a curve representing the flow (slightly curved due to angular momentum)
    const midPoint = new THREE.Vector3().lerpVectors(source, target, 0.5);
    // Add some "swirl" offset to the midpoint based on time to simulate spiraling in
    midPoint.x += Math.sin(t * 2) * (distance * 0.2);
    midPoint.z += Math.cos(t * 2) * (distance * 0.2);

    const curve = new THREE.QuadraticBezierCurve3(source, midPoint, target);

    for (let i = 0; i < particleCount; i++) {
      // Calculate position along curve based on time and index
      // Particles move from Source (0) to Target (1)
      const speed = 1.0 + (Math.random() * 0.5);
      const offset = i / particleCount;
      let progress = (t * speed + offset) % 1;
      
      // Non-linear progress: accelerate as they get closer to the black hole
      progress = Math.pow(progress, 0.7);

      const pos = curve.getPoint(progress);
      
      dummy.position.copy(pos);
      
      // Scale down as they approach the event horizon (spaghettification/compression)
      const scale = (1 - progress) * (0.2 + intensity * 0.1) + 0.05;
      dummy.scale.set(scale, scale, scale * 3); // Stretch along movement slightly
      
      // Rotate to face target roughly
      dummy.lookAt(target);
      
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      
      // Update color opacity based on progress (fade in start, fade out end)
      // Note: modifying material color per instance requires custom shader or attribute, 
      // here we rely on geometry scaling for visual fade effect logic.
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial 
        color={color} 
        transparent 
        opacity={0.6} 
        blending={THREE.AdditiveBlending} 
      />
    </instancedMesh>
  );
};
