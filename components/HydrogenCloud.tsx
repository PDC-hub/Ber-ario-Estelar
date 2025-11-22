
import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { CloudData } from '../types';

interface HydrogenCloudProps {
  data: CloudData;
  onClick: (id: string) => void;
  onFocus: (id: string) => void;
  isZoomMode: boolean;
  timeScale: number;
}

export const HydrogenCloud: React.FC<HydrogenCloudProps> = ({ data, onClick, onFocus, isZoomMode, timeScale }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  // Create random particles for the cloud
  const particleCount = Math.floor(data.size * 100);
  const [positions] = useState(() => {
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const r = Math.pow(Math.random(), 1/3) * (data.size / 2); 
      
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  });

  useFrame((state, delta) => {
    if (pointsRef.current) {
      let speed = data.rotationSpeed;
      const effectiveDelta = delta * timeScale;

      if (data.isCollapsing) {
        // Accelerate rotation as it collapses
        const currentScale = pointsRef.current.scale.x;
        speed = data.rotationSpeed * (2 / (currentScale + 0.1));
        
        if (timeScale > 0) {
            const collapseSpeed = 0.4 * delta * Math.abs(timeScale); 
            pointsRef.current.scale.x = Math.max(0.01, pointsRef.current.scale.x - collapseSpeed);
            pointsRef.current.scale.y = Math.max(0.01, pointsRef.current.scale.y - collapseSpeed);
            pointsRef.current.scale.z = Math.max(0.01, pointsRef.current.scale.z - collapseSpeed * 0.1); 
            
            // Grow the core
            if (coreRef.current) {
                const scaleInv = 1 - pointsRef.current.scale.x; // 0 to 1
                coreRef.current.scale.setScalar(scaleInv * (data.size / 3));
                (coreRef.current.material as THREE.MeshBasicMaterial).opacity = scaleInv;
            }
        }
      }
      
      pointsRef.current.rotation.y += speed * effectiveDelta;
    }
  });

  const handleClick = (e: any) => {
      e.stopPropagation();
      if (data.isCollapsing) return;
      
      if (isZoomMode) {
          onFocus(data.id);
      } else {
          onClick(data.id);
      }
  };

  return (
    <group position={[data.position.x, data.position.y, data.position.z]}>
      <Points
        ref={pointsRef}
        positions={positions}
        stride={3}
        frustumCulled={false}
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <PointMaterial
          transparent
          color={hovered ? (isZoomMode ? "#ffff00" : "#88ccff") : "#5577aa"}
          size={0.15 * (data.isCollapsing ? 3 : 1)}
          sizeAttenuation={true}
          depthWrite={false}
          opacity={data.isCollapsing ? 0.8 : 0.4}
        />
      </Points>
      
      {/* Protostar Core: Only visible during collapse */}
      {data.isCollapsing && (
         <Sphere ref={coreRef} args={[1, 16, 16]} scale={0}>
            <meshBasicMaterial color="#ffaa44" transparent opacity={0} />
         </Sphere>
      )}

      {/* Visual cue for interaction */}
      {hovered && !data.isCollapsing && (
        <mesh>
          <sphereGeometry args={[data.size / 1.5, 16, 16]} />
          <meshBasicMaterial wireframe color={isZoomMode ? "#ffff00" : "#44aaff"} opacity={0.2} transparent />
        </mesh>
      )}
    </group>
  );
};
