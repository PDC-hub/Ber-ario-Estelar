
import React, { useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { v4 as uuidv4 } from 'uuid';
import { HydrogenCloud } from './components/HydrogenCloud';
import { CelestialBody } from './components/CelestialBody';
import { AudioAmbience } from './components/AudioAmbience';
import { generateStarDescription } from './services/geminiService';
import { CloudData, StarData, StarType, LogEntry, PlanetData } from './types';
import { Info, RotateCw, Sparkles, Rewind, FastForward, Play, Pause, Volume2, VolumeX, LocateFixed, Search } from 'lucide-react';
import * as THREE from 'three';

const COLORS = {
  RED: '#ff4444',
  YELLOW: '#ffdd44',
  BLUE: '#4488ff',
  WHITE: '#ffffff',
  PURPLE: '#aa44ff',
  ORANGE: '#ff8822',
  BROWN: '#8B4513',
};

// Constants for physics
const G = 0.5; 
const SOFTENING = 2.0; 

const getRandomPosition = (range: number) => ({
  x: (Math.random() - 0.5) * range,
  y: (Math.random() - 0.5) * range / 4,
  z: (Math.random() - 0.5) * range,
});

// Physics Engine Component
const PhysicsSystem = ({ 
  stars, 
  timeScale, 
  onMerger,
  onMassTransfer 
}: { 
  stars: StarData[], 
  timeScale: number, 
  onMerger: (winnerId: string, loserId: string) => void,
  onMassTransfer: (sourceId: string, targetId: string, amount: number) => void
}) => {
  useFrame((state, delta) => {
    const dt = delta * timeScale;
    
    if (dt === 0) return;

    // 1. Update Age
    if (dt > 0) {
        for (const star of stars) {
            star.age += dt * 10; // Age increments faster than seconds
        }
    }

    for (let i = 0; i < stars.length; i++) {
      const bodyA = stars[i];
      
      for (let j = i + 1; j < stars.length; j++) {
        const bodyB = stars[j];
        
        const dx = bodyB.position.x - bodyA.position.x;
        const dy = bodyB.position.y - bodyA.position.y;
        const dz = bodyB.position.z - bodyA.position.z;
        
        const distSq = dx*dx + dy*dy + dz*dz;
        const dist = Math.sqrt(distSq);
        
        // Interaction Logic
        const combinedRadius = bodyA.radius + bodyB.radius;
        
        // 1. Merger Threshold (Must be very close now)
        const mergeThreshold = combinedRadius * 0.4; 
        
        // 2. Capture/Tidal Zone (Where orbits stabilize)
        const captureRadius = combinedRadius * 6.0;

        // 3. Feeding Zone (Roche Limit approx)
        const isBH_A = bodyA.type.includes('Buraco Negro') || bodyA.type === StarType.QUASAR;
        const isBH_B = bodyB.type.includes('Buraco Negro') || bodyB.type === StarType.QUASAR;
        const feedingThreshold = combinedRadius * (isBH_A || isBH_B ? 8 : 0);

        // Determine Predator/Prey
        let winner = bodyA;
        let loser = bodyB;
        if (isBH_B && !isBH_A) { winner = bodyB; loser = bodyA; }
        else if (bodyB.mass > bodyA.mass && !isBH_A) { winner = bodyB; loser = bodyA; }

        // --- PHYSICS FORCES ---

        // Standard Gravity
        const force = (G * bodyA.mass * bodyB.mass) / (distSq + SOFTENING);
        const fx = force * dx / dist;
        const fy = force * dy / dist;
        const fz = force * dz / dist;
        
        bodyA.velocity.x += (fx / bodyA.mass) * dt;
        bodyA.velocity.y += (fy / bodyA.mass) * dt;
        bodyA.velocity.z += (fz / bodyA.mass) * dt;
        
        bodyB.velocity.x -= (fx / bodyB.mass) * dt;
        bodyB.velocity.y -= (fy / bodyB.mass) * dt;
        bodyB.velocity.z -= (fz / bodyB.mass) * dt;

        // --- ORBITAL CAPTURE & STABILIZATION ---
        
        if (dist < captureRadius && dist > mergeThreshold) {
            // Calculate Relative Velocity
            const relVx = bodyB.velocity.x - bodyA.velocity.x;
            const relVy = bodyB.velocity.y - bodyA.velocity.y;
            const relVz = bodyB.velocity.z - bodyA.velocity.z;

            // Normal vector (direction from A to B)
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;

            // Radial Velocity (Speed at which they are moving towards/away from each other)
            // Dot product of Relative Velocity and Normal
            const radialVel = relVx * nx + relVy * ny + relVz * nz;

            // TIDAL FRICTION / DAMPING
            // We want to dampen radial velocity significantly (stop them from flying apart),
            // but preserve tangential velocity (keep them spinning).
            
            let damping = 0;

            if (radialVel > 0) {
                // Moving APART: Apply strong damping to capture them
                damping = 0.1 * dt; 
            } else {
                // Moving TOGETHER: Apply weak damping to prevent crash and circularize orbit
                damping = 0.005 * dt;
            }

            // Apply damping force opposing the relative velocity vector
            // But weighted heavily towards the radial component to Circularize
            
            // Simple Friction Implementation for stability:
            // Apply force against the current velocity vector relative to center of mass frame roughly
            const massRatio = loser.mass / (winner.mass + loser.mass);
            
            // Apply friction to both based on mass
            const fDampX = relVx * damping;
            const fDampY = relVy * damping;
            const fDampZ = relVz * damping;

            bodyA.velocity.x += fDampX * (bodyB.mass / (bodyA.mass + bodyB.mass));
            bodyA.velocity.y += fDampY * (bodyB.mass / (bodyA.mass + bodyB.mass));
            bodyA.velocity.z += fDampZ * (bodyB.mass / (bodyA.mass + bodyB.mass));

            bodyB.velocity.x -= fDampX * (bodyA.mass / (bodyA.mass + bodyB.mass));
            bodyB.velocity.y -= fDampY * (bodyA.mass / (bodyA.mass + bodyB.mass));
            bodyB.velocity.z -= fDampZ * (bodyA.mass / (bodyA.mass + bodyB.mass));
        }

        // --- FEEDING & MERGING ---

        if (dist < mergeThreshold) {
           // Final Merger
           const totalMass = winner.mass + loser.mass;
           winner.velocity.x = (winner.velocity.x * winner.mass + loser.velocity.x * loser.mass) / totalMass;
           winner.velocity.y = (winner.velocity.y * winner.mass + loser.velocity.y * loser.mass) / totalMass;
           winner.velocity.z = (winner.velocity.z * winner.mass + loser.velocity.z * loser.mass) / totalMass;
           
           winner.mass = totalMass;
           winner.radius = Math.pow(Math.pow(winner.radius, 3) + Math.pow(loser.radius, 3), 1/3);
           
           onMerger(winner.id, loser.id);
           return; 

        } else if (dist < feedingThreshold) {
            // Feeding Logic (Black Holes)
            const transferRate = 0.1 * dt; 
            if (loser.mass > 0.1) {
                onMassTransfer(loser.id, winner.id, transferRate);
                loser.consumedBy = winner.id;
                loser.isShredding = true;
                
                // Extra drag when feeding to force spiral in
                const relVx = bodyB.velocity.x - bodyA.velocity.x;
                const relVy = bodyB.velocity.y - bodyA.velocity.y;
                const relVz = bodyB.velocity.z - bodyA.velocity.z;
                
                const spiralDrag = 0.05 * dt;
                loser.velocity.x -= relVx * spiralDrag;
                loser.velocity.y -= relVy * spiralDrag;
                loser.velocity.z -= relVz * spiralDrag;
            }
        }
      }
    }

    // Update Positions
    for (let i = 0; i < stars.length; i++) {
       const star = stars[i];
       star.position.x += star.velocity.x * dt;
       star.position.y += star.velocity.y * dt;
       star.position.z += star.velocity.z * dt;
    }
  });

  return null;
};

// Camera Rig Component
const CameraRig = ({ focusedId, stars, clouds }: { focusedId: string | null, stars: StarData[], clouds: CloudData[] }) => {
  const { camera, controls } = useThree();
  const vec = new THREE.Vector3();

  useFrame((state, delta) => {
    if (focusedId) {
      const star = stars.find(s => s.id === focusedId);
      const cloud = clouds.find(c => c.id === focusedId);
      
      const target = star ? star.position : (cloud ? cloud.position : null);

      if (target) {
        const ctrl = controls as any;
        if (ctrl) {
            vec.set(target.x, target.y, target.z);
            ctrl.target.lerp(vec, 2 * delta);
            
            const targetPos = new THREE.Vector3(target.x, target.y, target.z);
            const dist = camera.position.distanceTo(targetPos);
            
            // Zoom closer for clouds/stars if far away
            const optimalDist = star ? 20 : 15;

            if (dist > 50 || dist < 5) {
                const direction = new THREE.Vector3().subVectors(camera.position, targetPos).normalize();
                const goalPos = targetPos.clone().add(direction.multiplyScalar(optimalDist));
                camera.position.lerp(goalPos, 1 * delta);
            }
            ctrl.update();
        }
      }
    }
  });
  return null;
};

// Spawner System: Adds new clouds periodically
const UniverseSpawner = ({ addCloud }: { addCloud: () => void }) => {
  useFrame((state) => {
    // Spawn a new cloud roughly every 8 seconds
    if (state.clock.elapsedTime > 5 && Math.floor(state.clock.elapsedTime) % 8 === 0 && Math.random() < 0.01) {
        addCloud();
    }
  });
  return null;
};

export default function App() {
  const [clouds, setClouds] = useState<CloudData[]>([]);
  const [stars, setStars] = useState<StarData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isZoomMode, setIsZoomMode] = useState(false);

  // Initialize Universe
  useEffect(() => {
    generateUniverse();
  }, []);

  const spawnCloud = useCallback(() => {
      if (clouds.length > 30) return; 

      setClouds(prev => [
          ...prev,
          {
            id: uuidv4(),
            position: getRandomPosition(350), 
            mass: Math.random() * 100, 
            size: 4 + Math.random() * 6,
            isCollapsing: false,
            collapseProgress: 0,
            rotationSpeed: 0.1 + Math.random() * 0.3,
          }
      ]);
  }, [clouds.length]);

  const generateUniverse = () => {
    const newClouds: CloudData[] = [];
    for (let i = 0; i < 15; i++) {
      newClouds.push({
        id: uuidv4(),
        position: getRandomPosition(250),
        mass: Math.random() * 100, 
        size: 4 + Math.random() * 6,
        isCollapsing: false,
        collapseProgress: 0,
        rotationSpeed: 0.1 + Math.random() * 0.4,
      });
    }
    
    const roguePlanets: StarData[] = [];
    // Fewer rogue planets to start, focus on clouds
    for(let i=0; i<3; i++) {
        roguePlanets.push({
            id: uuidv4(),
            position: getRandomPosition(300),
            mass: 0.5,
            type: StarType.ROGUE_PLANET,
            radius: 0.3,
            color: '#556677',
            emissiveIntensity: 0,
            rotationSpeed: 1,
            accretionDisk: false,
            planets: [],
            age: 10000,
            velocity: { 
                x: (Math.random() - 0.5) * 0.4, 
                y: (Math.random() - 0.5) * 0.05, 
                z: (Math.random() - 0.5) * 0.4 
            }
        });
    }

    setClouds(newClouds);
    setStars(roguePlanets);
    setFocusedId(null);
    setTimeScale(1);
    setLogs([{
      id: 'init',
      title: 'Big Bang Simulado',
      content: 'Universo reiniciado. Nuvens de hidrogênio dispersas. Observe a formação gravitacional e a captura orbital.',
      timestamp: new Date()
    }]);
  };

  const handleMerger = (winnerId: string, loserId: string) => {
      const winner = stars.find(s => s.id === winnerId);
      const loser = stars.find(s => s.id === loserId);
      
      if (winner && loser) {
          setStars(prev => prev.filter(s => s.id !== loserId));
          
          const isBH = winner.type.includes('Buraco Negro');
          const action = isBH ? 'consumiu a matéria de' : 'fundiu-se com';
          
          setLogs(prev => [{
              id: uuidv4(),
              title: isBH ? 'Singularidade Alimentada' : 'Fusão Estelar',
              content: `O corpo ${winner.type} estabilizou a órbita e ${action} ${loser.type}.`,
              timestamp: new Date()
          }, ...prev]);

          if (focusedId === loserId) {
              setFocusedId(winnerId);
          }
      }
  };

  const handleMassTransfer = (sourceId: string, targetId: string, amount: number) => {
      // Visual and physics updates handled by mutating refs in PhysicsSystem for performance
      setStars(prevStars => {
          const sourceIndex = prevStars.findIndex(s => s.id === sourceId);
          const targetIndex = prevStars.findIndex(s => s.id === targetId);
          if (sourceIndex === -1 || targetIndex === -1) return prevStars;

          const newStars = [...prevStars];
          // Only trigger update if state changes significantly to avoid react trashing
          if (!newStars[sourceIndex].isShredding) {
               newStars[sourceIndex] = { 
                   ...newStars[sourceIndex], 
                   consumedBy: targetId, 
                   isShredding: true 
               };
               return newStars;
          }
          // Actual mass values are updated by reference in Physics loop, 
          // but we need to update state periodically to reflect UI? 
          // For smooth React rendering, we can trust the ref mutations for physics 
          // and only update state for major events or rely on 3D components reading refs?
          // In this architecture, modifying the object inside the array works for Three fiber loops
          // but React state doesn't "know".
          // We will let the physics loop handle the continuous mass change on the objects directly.
          return prevStars; 
      });
  };

  const handleCloudClick = async (id: string) => {
    const cloud = clouds.find(c => c.id === id);
    if (!cloud) return;

    if (isZoomMode) {
        setFocusedId(id);
        setIsZoomMode(false);
        return;
    }

    if (cloud.isCollapsing) return;

    // Trigger Collapse Animation
    setClouds(prev => prev.map(c => c.id === id ? { ...c, isCollapsing: true } : c));

    const mass = cloud.mass;
    const rand = Math.random();

    // Determine Star Type
    let type: StarType;
    let color: string;
    let radius: number;
    let intensity: number;
    let disk = true;
    let secondaryColor = undefined;

    if (mass < 15) {
      type = StarType.BROWN_DWARF;
      color = COLORS.BROWN;
      radius = 0.6;
      intensity = 0.5;
      disk = false;
    } else if (mass < 30) {
      type = StarType.RED_DWARF;
      color = COLORS.RED;
      radius = 0.8;
      intensity = 2;
    } else if (mass < 60) {
      if (rand > 0.8) {
          type = StarType.BINARY_STAR;
          color = COLORS.YELLOW;
          secondaryColor = COLORS.RED;
          radius = 1.2;
          intensity = 4;
      } else {
          type = StarType.YELLOW_DWARF;
          color = COLORS.YELLOW;
          radius = 1.5;
          intensity = 5;
      }
    } else if (mass < 80) {
      type = StarType.BLUE_GIANT;
      color = COLORS.BLUE;
      radius = 2.5;
      intensity = 8;
    } else if (mass < 90) {
      type = StarType.NEUTRON_STAR;
      color = COLORS.WHITE;
      radius = 0.5;
      intensity = 15;
    } else if (mass < 98) {
      type = StarType.BLACK_HOLE;
      color = "#000000";
      radius = 1;
      intensity = 0;
    } else {
      type = StarType.QUASAR;
      color = COLORS.PURPLE;
      radius = 3;
      intensity = 20;
    }

    // Generate Planets Data (Visually latent until age increases)
    const numPlanets = Math.floor(Math.random() * 6) + 2;
    const planets: PlanetData[] = [];
    for(let i=0; i<numPlanets; i++) {
        const pType = Math.random() > 0.6 ? 'gas' : 'rocky';
        planets.push({
            id: uuidv4(),
            distance: radius * 4 + (i * 2) + Math.random() * 2,
            size: radius * (pType === 'gas' ? 0.3 : 0.12) + Math.random() * 0.05,
            speed: (0.8 + Math.random()) / (Math.sqrt(i + 1)), // Kepler-ish
            angle: Math.random() * Math.PI * 2,
            color: pType === 'gas' ? COLORS.ORANGE : '#888888',
            type: pType as any,
            mass: pType === 'gas' ? 0.01 : 0.002
        });
    }

    // Duration of collapse animation
    setTimeout(async () => {
      const newStar: StarData = {
        id: cloud.id,
        position: cloud.position,
        velocity: { x: (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.02, z: (Math.random() - 0.5) * 0.2 },
        mass,
        type,
        radius,
        color,
        secondaryColor,
        emissiveIntensity: intensity,
        rotationSpeed: cloud.rotationSpeed * 10,
        accretionDisk: disk,
        planets,
        age: 0, // Starts at 0 for dust formation animation
        consumedBy: null,
        isShredding: false
      };

      setClouds(prev => prev.filter(c => c.id !== id));
      setStars(prev => [...prev, newStar]);
      
      setFocusedId(newStar.id);
      
      // Generate Description
      setLoading(true);
      const description = await generateStarDescription(type, mass);
      setLogs(prev => [{
        id: uuidv4(),
        title: `Nascimento: ${type}`,
        content: description,
        timestamp: new Date()
      }, ...prev]);
      setLoading(false);
    }, 2500);
  };

  const handleStarClick = (id: string) => {
      setFocusedId(id);
      if (isZoomMode) {
          setIsZoomMode(false);
      }
  };

  const toggleAudio = () => {
      setAudioEnabled(!audioEnabled);
  };

  return (
    <div className={`relative w-full h-full bg-black text-white font-sans overflow-hidden select-none ${isZoomMode ? 'cursor-zoom-in' : ''}`}>
      
      <AudioAmbience isPlaying={audioEnabled} />

      {/* 3D Scene */}
      <Canvas camera={{ position: [0, 20, 40], fov: 60 }}>
        <ambientLight intensity={0.1} />
        <Stars radius={300} depth={50} count={8000} factor={4} saturation={0} fade speed={0.5} />
        
        <OrbitControls 
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          maxDistance={400}
          minDistance={2}
        />
        
        <PhysicsSystem 
            stars={stars} 
            timeScale={timeScale} 
            onMerger={handleMerger} 
            onMassTransfer={handleMassTransfer}
        />
        <UniverseSpawner addCloud={spawnCloud} />
        <CameraRig focusedId={focusedId} stars={stars} clouds={clouds} />

        {clouds.map(cloud => (
          <HydrogenCloud 
            key={cloud.id} 
            data={cloud} 
            onClick={handleCloudClick} 
            onFocus={(id) => { setFocusedId(id); setIsZoomMode(false); }}
            isZoomMode={isZoomMode}
            timeScale={timeScale}
          />
        ))}

        {stars.map(star => (
          <CelestialBody 
            key={star.id} 
            data={star} 
            timeScale={timeScale}
            isFocused={focusedId === star.id}
            onZoom={handleStarClick}
            isZoomMode={isZoomMode}
            predatorPosition={star.consumedBy ? stars.find(s => s.id === star.consumedBy)?.position : undefined}
          />
        ))}
      </Canvas>

      {/* Top Bar UI */}
      <div className="absolute top-0 left-0 p-6 pointer-events-none w-full flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="pointer-events-auto bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 max-w-sm">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-400" />
            Berçário Estelar
          </h1>
          <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-gray-400">
             <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#8B4513]"></div>A. Castanha</span>
             <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400"></div>Sol</span>
             <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500 flex"><div className="w-full h-full rounded-full bg-yellow-400 ml-1"></div></div>Binário</span>
             <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-white shadow-[0_0_5px_white]"></div>Pulsar</span>
             <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-gray-500"></div>Errante</span>
          </div>
        </div>

        {/* Time & Tool Controls */}
        <div className="pointer-events-auto bg-black/60 backdrop-blur-md p-2 rounded-xl border border-white/10 flex items-center gap-2">
            <button onClick={() => setTimeScale(-8)} className={`p-2 rounded hover:bg-white/20 ${timeScale === -8 ? 'bg-red-500/50' : ''}`}><Rewind size={16} /></button>
            <button onClick={() => setTimeScale(-2)} className={`p-2 rounded hover:bg-white/20 ${timeScale === -2 ? 'bg-red-500/30' : ''}`}><Rewind size={12} /></button>
            <button onClick={() => setTimeScale(0)} className={`p-2 rounded hover:bg-white/20 ${timeScale === 0 ? 'bg-white/20' : ''}`}><Pause size={16} /></button>
            <button onClick={() => setTimeScale(1)} className={`p-2 rounded hover:bg-white/20 ${timeScale === 1 ? 'bg-blue-500/50' : ''}`}><Play size={16} /></button>
            <button onClick={() => setTimeScale(4)} className={`p-2 rounded hover:bg-white/20 ${timeScale === 4 ? 'bg-blue-500/30' : ''}`}><FastForward size={12} /></button>
            <button onClick={() => setTimeScale(8)} className={`p-2 rounded hover:bg-white/20 ${timeScale === 8 ? 'bg-blue-500/50' : ''}`}><FastForward size={16} /></button>
            <div className="w-px h-6 bg-white/20 mx-2"></div>
            
            <button 
                onClick={toggleAudio} 
                className={`p-2 rounded hover:bg-white/20 ${audioEnabled ? 'text-purple-300 bg-purple-500/20' : 'text-gray-400'}`}
                title="Áudio"
            >
                {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>

            <div className="w-px h-6 bg-white/20 mx-2"></div>

            <button 
                onClick={() => setIsZoomMode(!isZoomMode)} 
                className={`p-2 rounded hover:bg-white/20 transition-all ${isZoomMode ? 'bg-yellow-500/80 text-black scale-110' : 'text-gray-300'}`}
                title="Ferramenta de Lupa (Zoom)"
            >
                <Search size={18} />
            </button>
        </div>

        <div className="pointer-events-auto">
            <button 
                onClick={generateUniverse}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-all active:scale-95"
            >
                <RotateCw size={16} />
                Reiniciar
            </button>
        </div>
      </div>

      {/* HUD Info */}
      {focusedId && (
          <div className="absolute bottom-6 left-6 pointer-events-none animate-fade-in">
              <div className="bg-black/50 backdrop-blur text-xs p-2 rounded border border-white/10 flex items-center gap-2 text-blue-200">
                  <LocateFixed size={14} />
                  Foco: {stars.find(s => s.id === focusedId)?.type || clouds.find(c => c.id === focusedId) ? 'Nuvem de Hidrogênio' : 'Objeto Desconhecido'}
              </div>
          </div>
      )}

      {/* Cosmic Log Panel */}
      <div className="absolute bottom-0 right-0 p-6 h-2/3 w-full max-w-md pointer-events-none flex flex-col justify-end">
        <div className="pointer-events-auto bg-black/80 backdrop-blur-lg border-t border-l border-white/10 rounded-tl-2xl p-4 h-full overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-blue-300">
                    <Info size={20} />
                    Registro Cósmico
                </h2>
                {loading && <span className="text-xs text-yellow-400 animate-pulse">Analisando...</span>}
            </div>
            
            <div className="overflow-y-auto flex-1 pr-2 space-y-4 scrollbar-thin scrollbar-thumb-white/20">
                {logs.length === 0 && <p className="text-gray-500 italic text-center mt-10">Aguardando eventos estelares...</p>}
                {logs.map(log => (
                    <div key={log.id} className="bg-white/5 p-3 rounded-lg border border-white/5 hover:border-white/20 transition-colors">
                        <div className="flex justify-between items-baseline mb-1">
                            <h3 className="font-bold text-purple-300">{log.title}</h3>
                            <span className="text-[10px] text-gray-500">{log.timestamp.toLocaleTimeString()}</span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed text-justify">
                            {log.content}
                        </p>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}
