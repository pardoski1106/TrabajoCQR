/**
 * Datos de demostración del "mundo" de la empresa. Viven SOLO en el cliente web:
 * el servidor no conoce empleados ni cargos, solo recibe el texto del campo `autor`
 * ("Nombre · Cargo"). Los permisos de aqui son de interfaz (demostrativos), no seguridad real.
 */
export const EMPRESA = { nombre: 'Nexora', lema: 'Comunicaciones internas' };

export interface Empleado {
  id: string;
  nombre: string;
  cargo: string;
  area: string;
  color: string;
}

export const EMPLEADOS: Empleado[] = [
  { id: 'lg', nombre: 'Laura Gómez', cargo: 'Gerente', area: 'Finanzas', color: '#6d5efc' },
  { id: 'sv', nombre: 'Sofía Vega', cargo: 'Directora', area: 'Comercial', color: '#e8590c' },
  { id: 'ma', nombre: 'María Ángel', cargo: 'Líder', area: 'Talento Humano', color: '#0ca678' },
  { id: 'jp', nombre: 'Juan Pérez', cargo: 'Desarrollador', area: 'Tecnología', color: '#1c7ed6' },
  { id: 'cr', nombre: 'Carlos Ruiz', cargo: 'Analista', area: 'Finanzas', color: '#c2255c' },
  { id: 'dm', nombre: 'Diego Mora', cargo: 'Auxiliar', area: 'Operaciones', color: '#74808f' },
];

/** Cargos que pueden crear canales (regla de demostración en la interfaz). */
const CARGOS_ADMIN = ['Gerente', 'Directora', 'Líder'];
export const puedeCrearCanales = (e: Empleado): boolean => CARGOS_ADMIN.includes(e.cargo);

export const CANALES_SUGERIDOS = ['General', 'Finanzas', 'Talento Humano', 'Tecnología', 'Comercial', 'Operaciones'];

const SEP = ' · ';
/** Formato que viaja en el campo `autor` (máx. 40 caracteres en el servidor). */
export const autorDe = (e: Empleado): string => `${e.nombre}${SEP}${e.cargo}`;

export function parseAutor(autor: string): { nombre: string; cargo?: string; empleado?: Empleado } {
  const [nombre = autor, cargo] = autor.split(SEP);
  return { nombre, cargo, empleado: EMPLEADOS.find((e) => e.nombre === nombre) };
}

export const iniciales = (nombre: string): string =>
  nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

const COLORES = ['#6d5efc', '#e8590c', '#0ca678', '#1c7ed6', '#c2255c', '#74808f'];
/** Color estable para autores que no están en el directorio (consola, curl...). */
export function colorDe(nombre: string): string {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length]!;
}
