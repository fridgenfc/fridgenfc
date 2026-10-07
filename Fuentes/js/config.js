// Configuración de FridgeNFC.
//
// Rellena estos dos valores con los de tu proyecto de Supabase
// (Project Settings → API). La clave "anon" es pública por diseño: la
// seguridad la ponen las funciones de supabase/esquema.sql.
//
// Si se quedan vacíos, la app funciona en modo local: cada móvil guarda
// su propia lista y no se sincroniza con nadie. Útil para probar.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Cada cuánto se refresca la lista mientras la app está abierta (ms).
export const INTERVALO_REFRESCO = 15000;
