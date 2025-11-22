
export enum StarType {
  BROWN_DWARF = 'Anã Castanha',
  RED_DWARF = 'Anã Vermelha',
  YELLOW_DWARF = 'Anã Amarela (Tipo Sol)',
  BINARY_STAR = 'Sistema Binário',
  BLUE_GIANT = 'Gigante Azul',
  NEUTRON_STAR = 'Estrela de Nêutrons (Pulsar)',
  BLACK_HOLE = 'Buraco Negro',
  SUPERMASSIVE_BLACK_HOLE = 'Buraco Negro Supermassivo',
  QUASAR = 'Quasar',
  ROGUE_PLANET = 'Planeta Errante'
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface CloudData {
  id: string;
  position: Position;
  mass: number; // 1 to 100 scale
  size: number;
  isCollapsing: boolean;
  collapseProgress: number; // 0 to 1
  rotationSpeed: number;
}

export interface PlanetData {
  id: string;
  distance: number;
  size: number;
  speed: number;
  angle: number;
  color: string;
  type: 'rocky' | 'gas' | 'ice';
  mass?: number;
}

export interface StarData {
  id: string;
  position: Position;
  velocity: Position; // Changed to mandatory for physics engine
  mass: number;
  type: StarType;
  radius: number;
  color: string;
  secondaryColor?: string; // For binary stars
  emissiveIntensity: number;
  rotationSpeed: number;
  accretionDisk: boolean;
  planets: PlanetData[];
  age: number;
  // New fields for interaction physics
  consumedBy?: string | null; // ID of the body eating this one
  isShredding?: boolean; // Visual state for stars being torn apart
}

export interface LogEntry {
  id: string;
  title: string;
  content: string;
  timestamp: Date;
}
