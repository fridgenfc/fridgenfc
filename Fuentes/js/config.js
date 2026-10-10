// Configuración de FridgeNFC.
//
// Rellena estos dos valores con los de tu proyecto de Supabase
// (Project Settings → API). La clave "anon" es pública por diseño: la
// seguridad la ponen las funciones de supabase/esquema.sql.
//
// Si se quedan vacíos, la app funciona en modo local: cada móvil guarda
// su propia lista y no se sincroniza con nadie. Útil para probar.
export const SUPABASE_URL = 'https://cpqruqhgupmoqpmsxcgn.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwcXJ1cWhndXBtb3FwbXN4Y2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNzYwMDEsImV4cCI6MjEwMTk1MjAwMX0.tGHt-xz5JRnf2Av6Jo0z9th_zPmiNG2N0kz2hTpn9mk';

// Cada cuánto se refresca la lista mientras la app está abierta (ms).
export const INTERVALO_REFRESCO = 15000;
