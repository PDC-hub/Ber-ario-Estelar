
import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Torus, MeshDistortMaterial, Sparkles, Ring } from '@react-three/drei';
import * as THREE from 'three';
import { StarData, StarType, PlanetData, Position } from '../types';
import { MatterStream } from './MatterStream';

interface CelestialBodyProps {
  data: StarData;
  timeScale: number;
  onZoom: (id: string) => void;
  isFocused: boolean;
  isZoomMode: boolean;
  predatorPosition?: Position; // Position of the star eating this one
}

// Visual component for dust turning into planets
const ProtoplanetaryDisk = ({ radius, opacity }: { radius: number, opacity: number }) => {
    return (
        <group>
            {/* Outer dust */}
            <Sparkles 
                count={200}
                scale={radius * 6}
                size={3}
                speed={0.4}
                opacity={opacity * 0.5}
                color="#aa8866"
            />
            {/* Inner dense dust */}
            <Sparkles 
                count={100}
                scale={radius * 4}
                size={2}
                speed={0.8}
                opacity={opacity * 0.8}
                color="#ffcc88"
            />
             {/* Visible ring structure */}
             <Ring args={[radius * 2, radius * 5, 64]} rotation={[-Math.PI / 2, 0, 0]}>
                <meshBasicMaterial color="#aa7744" transparent opacity={opacity * 0.1} side={THREE.DoubleSide} />
             </Ring>
        </group>
    )
}

export const CelestialBody: React.FC<CelestialBodyProps> = ({ data, timeScale, onZoom, isFocused, isZoomMode, predatorPosition }) => {
  const groupRef = useRef<THREE.Group>(null);
  const visualWrapperRef = useRef<THREE.Group>(null); // Wrapper for rotation/orientation independent of position
  const starRef = useRef<THREE.Mesh>(null);
  const secondaryStarRef = useRef<THREE.Mesh>(null); // For Binaries
  const diskRef = useRef<THREE.Mesh>(null);
  const diskMatRef = useRef<THREE.MeshBasicMaterial>(null); // Ref for dynamic material updates
  const shockwaveRef = useRef<THREE.Mesh>(null);
  
  const [hovered, setHovered] = useState(false);
  
  // Local state for planets to handle collisions/mergers without re-rendering parent constantly
  const [activePlanets, setActivePlanets] = useState<PlanetData[]>(data.planets);
  
  // Refs for planet meshes to update positions directly
  const planetRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Memoize geometry/materials
  const isBlackHole = data.type === StarType.BLACK_HOLE || data.type === StarType.SUPERMASSIVE_BLACK_HOLE || data.type === StarType.QUASAR;
  const isPulsar = data.type === StarType.NEUTRON_STAR;
  const isBinary = data.type === StarType.BINARY_STAR;
  const isRogue = data.type === StarType.ROGUE_PLANET;
  const isBrownDwarf = data.type === StarType.BROWN_DWARF;

  // Calculate Formation Progress based on Age (0 to 1)
  // Assuming age ~500 is "mature"
  const formationProgress = Math.min(data.age / 800, 1); 
  const isForming = formationProgress < 1;

  useFrame((state, delta) => {
    const effectiveDelta = delta * timeScale;

    // 1. Sync Position from Physics Engine (App.tsx)
    if (groupRef.current) {
      groupRef.current.position.set(data.position.x, data.position.y, data.position.z);
    }

    // 2. Birth Shockwave Animation
    if (shockwaveRef.current && data.age < 50) {
        const t = data.age / 50; // 0 to 1
        shockwaveRef.current.scale.setScalar(1 + t * 20);
        const mat = shockwaveRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - t) * 0.5;
    }

    // 3. Tidal Locking & Shredding Logic
    if (visualWrapperRef.current && starRef.current) {
        if (data.isShredding && predatorPosition) {
            // Look at predator to simulate tidal stretching direction
            const target = new THREE.Vector3(predatorPosition.x, predatorPosition.y, predatorPosition.z);
            visualWrapperRef.current.lookAt(target);
            
            // Spaghettification: Stretch towards predator (Z-axis local), squash others
            // Add a pulse to the stretch
            const pulse = Math.sin(state.clock.elapsedTime * 20) * 0.1;
            const stretch = 1.5 + pulse; // Stretch factor
            const squash = 1 / Math.sqrt(stretch); // Maintain rough volume (approx)
            
            starRef.current.scale.lerp(new THREE.Vector3(squash, squash, stretch), 0.1);
            
            // Intense vibration
            starRef.current.position.x = (Math.random() - 0.5) * 0.2;
            starRef.current.position.y = (Math.random() - 0.5) * 0.2;
        } else {
            // Reset orientation influence if not shredding
            visualWrapperRef.current.rotation.set(0, 0, 0);
            
            // Normal Rotation (Spin)
            const speedMultiplier = 1;
            starRef.current.rotation.y += data.rotationSpeed * speedMultiplier * effectiveDelta;
            starRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
            starRef.current.position.set(0,0,0);
        }
    }

    // 4. Binary Star System Logic (Internal Orbit)
    if (isBinary && secondaryStarRef.current && starRef.current && !data.isShredding) {
        const orbitSpeed = data.rotationSpeed * 0.5;
        const orbitRadius = data.radius * 1.5;
        const t = state.clock.elapsedTime * timeScale; 
        
        starRef.current.position.x = Math.cos(t * orbitSpeed) * orbitRadius;
        starRef.current.position.z = Math.sin(t * orbitSpeed) * orbitRadius;
        
        secondaryStarRef.current.position.x = Math.cos(t * orbitSpeed + Math.PI) * orbitRadius;
        secondaryStarRef.current.position.z = Math.sin(t * orbitSpeed + Math.PI) * orbitRadius;
    }

    // 5. Disk Rotation & Dynamic Accumulation Pulse
    if (diskRef.current) {
      diskRef.current.rotation.z += (data.rotationSpeed * 0.8) * effectiveDelta;
      
      if (isBlackHole) {
          // Calculate growth factor based on mass. 
          const baseMass = 80;
          const growthFactor = Math.max(1, data.mass / baseMass);
          
          const pulseSpeed = 3 + (growthFactor * 0.5);
          const pulseIntensity = 0.05 * growthFactor;
          const pulse = 1 + Math.sin(state.clock.elapsedTime * pulseSpeed) * pulseIntensity;
          
          const targetScale = growthFactor * pulse;
          diskRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.05);

          if (diskMatRef.current) {
              const targetOpacity = Math.min(0.9, 0.4 + (growthFactor - 1) * 0.3);
              diskMatRef.current.opacity = THREE.MathUtils.lerp(diskMatRef.current.opacity, targetOpacity, 0.05);
              
              const baseColor = new THREE.Color(data.type === StarType.QUASAR ? "#ffaa00" : data.color);
              const hotColor = new THREE.Color("#ffffff");
              const mix = Math.min(1, (growthFactor - 1) * 0.2); 
              diskMatRef.current.color.lerpColors(baseColor, hotColor, mix);
          }
      }
    }

    // 6. Planet Orbits
    if (timeScale !== 0 && activePlanets.length > 0) {
         activePlanets.forEach((planet, i) => {
             const ref = planetRefs.current[i];
             if (ref) {
                 planet.angle += planet.speed * effectiveDelta;
                 const r = planet.distance;
                 ref.position.x = Math.cos(planet.angle) * r;
                 ref.position.z = Math.sin(planet.angle) * r;
                 ref.rotation.y += 2 * effectiveDelta;
             }
         });
    }
  });

  const handleClick = (e: any) => {
      e.stopPropagation();
      onZoom(data.id);
  };

  // Calculate color for shredding effect
  const displayColor = data.isShredding ? new THREE.Color(data.color).lerp(new THREE.Color('#ff4400'), 0.5) : data.color;

  return (
    <group>
        <group 
            ref={groupRef}
            onClick={handleClick}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
        >
            {/* Wrapper for orientation effects */}
            <group ref={visualWrapperRef}>
                
                {/* Main Body */}
                <Sphere ref={starRef} args={[data.radius, 32, 32]}>
                    {data.isShredding && !isBlackHole ? (
                         <MeshDistortMaterial
                            color={displayColor}
                            emissive={displayColor}
                            emissiveIntensity={data.emissiveIntensity * 2}
                            speed={5} 
                            distort={0.6} 
                            radius={1}
                         />
                    ) : (
                        <meshStandardMaterial 
                            color={isBlackHole ? "#000000" : data.color} 
                            emissive={isBlackHole ? "#000000" : data.color}
                            emissiveIntensity={isBrownDwarf ? 0.5 : data.emissiveIntensity}
                            roughness={isBlackHole ? 0 : (isBrownDwarf ? 0.8 : 0.4)}
                        />
                    )}
                </Sphere>

                {/* Shredding Debris */}
                {data.isShredding && (
                    <Sparkles 
                        count={50}
                        scale={data.radius * 3}
                        size={2}
                        speed={2}
                        opacity={0.8}
                        color={data.color}
                        noise={1} 
                    />
                )}

                {/* Binary Companion */}
                {isBinary && !data.isShredding && (
                    <Sphere ref={secondaryStarRef} args={[data.radius * 0.8, 32, 32]} position={[2,0,0]}>
                        <meshStandardMaterial 
                            color={data.secondaryColor || data.color} 
                            emissive={data.secondaryColor || data.color}
                            emissiveIntensity={data.emissiveIntensity}
                        />
                    </Sphere>
                )}
            </group>

            {/* Birth Shockwave */}
            {data.age < 50 && (
                <Ring ref={shockwaveRef} args={[data.radius, data.radius * 1.1, 32]} rotation={[-Math.PI/2, 0, 0]}>
                    <meshBasicMaterial color="white" transparent side={THREE.DoubleSide} />
                </Ring>
            )}

            {/* Protoplanetary Dust Ring */}
            {isForming && !isBlackHole && !isRogue && (
                <ProtoplanetaryDisk radius={data.radius} opacity={1 - formationProgress} />
            )}

            {/* Accretion Disk (Mature) */}
            {data.accretionDisk && !isRogue && !isForming && (
                <group rotation={[Math.PI / 2, 0, 0]}>
                <Torus ref={diskRef} args={[data.radius * (isBinary ? 4 : 3), data.radius * (isBinary ? 2 : 1.5), 2, 64]}>
                    <meshBasicMaterial 
                        ref={diskMatRef}
                        color={data.type === StarType.QUASAR ? "#ffaa00" : data.color} 
                        transparent 
                        opacity={isBlackHole ? 0.4 : 0.3} 
                        side={THREE.DoubleSide}
                    />
                </Torus>
                </group>
            )}
            
            {/* Black Hole Event Horizon */}
            {isBlackHole && (
                <mesh>
                <sphereGeometry args={[data.radius * 1.2, 32, 32]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.1} side={THREE.BackSide} />
                </mesh>
            )}

            {/* Pulsar/Quasar Jets */}
            {(isPulsar || data.type === StarType.QUASAR) && (
                <group>
                <mesh position={[0, data.radius * 4, 0]}>
                    <cylinderGeometry args={[data.radius * 0.1, 0, data.radius * 8, 8]} />
                    <meshBasicMaterial color={data.color} transparent opacity={0.7} />
                </mesh>
                <mesh position={[0, -data.radius * 4, 0]} rotation={[Math.PI, 0, 0]}>
                    <cylinderGeometry args={[data.radius * 0.1, 0, data.radius * 8, 8]} />
                    <meshBasicMaterial color={data.color} transparent opacity={0.7} />
                </mesh>
                </group>
            )}

            {/* Planets (Fade in based on age) */}
            {!isRogue && activePlanets.map((planet, i) => (
                <group key={planet.id}>
                <mesh
                    ref={(el) => (planetRefs.current[i] = el!)}
                    position={[planet.distance, 0, 0]} 
                >
                    <sphereGeometry args={[planet.size, 16, 16]} />
                    <meshStandardMaterial 
                        color={planet.color} 
                        roughness={0.7} 
                        transparent 
                        opacity={formationProgress} 
                    />
                </mesh>
                {/* Orbit Line */}
                <mesh rotation={[Math.PI/2, 0, 0]}>
                    <ringGeometry args={[planet.distance - 0.02, planet.distance + 0.02, 64]} />
                    <meshBasicMaterial 
                        color="#ffffff" 
                        opacity={0.03 * formationProgress} 
                        transparent 
                        side={THREE.DoubleSide} 
                        depthWrite={false} 
                    />
                </mesh>
                </group>
            ))}

            {/* Rogue Planet Trail */}
            {isRogue && (
                <mesh position={[0,0,0]}>
                    <sphereGeometry args={[data.radius * 2, 16, 16]} />
                    <meshBasicMaterial color="#ffffff" opacity={0.1} transparent wireframe />
                </mesh>
            )}

            {/* Lighting */}
            {!isBlackHole && !isRogue && (
                <pointLight 
                color={data.color} 
                intensity={(isBrownDwarf ? 0.5 : data.emissiveIntensity * 2) * formationProgress} 
                distance={data.radius * 50} 
                decay={2} 
                />
            )}
            
            {/* Selection Highlight */}
            {(isFocused || (hovered && isZoomMode)) && (
                <mesh>
                    <sphereGeometry args={[data.radius * (isBinary ? 6 : 4), 16, 16]} />
                    <meshBasicMaterial wireframe color={isZoomMode ? "yellow" : "white"} opacity={0.2} transparent />
                </mesh>
            )}
        </group>

        {/* Render Matter Stream if this star is being consumed */}
        {data.consumedBy && predatorPosition && (
            <MatterStream 
                sourcePos={data.position} 
                targetPos={predatorPosition} 
                color={data.color} 
                intensity={data.radius} 
            />
        )}
    </group>
  );
};
