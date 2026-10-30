// Categorías que se crean al registrarse. "Otros" es la de reserva y no se puede borrar.
export const FALLBACK_CATEGORY_NAME = 'Otros';

export const DEFAULT_CATEGORIES = [
  { name: 'Comida', color: '#f97316', icon: '🍽️' },
  { name: 'Transporte', color: '#0ea5e9', icon: '🚌' },
  { name: 'Ocio', color: '#a855f7', icon: '🎬' },
  { name: 'Salud', color: '#10b981', icon: '💊' },
  { name: 'Compras', color: '#ec4899', icon: '🛍️' },
  { name: 'Servicios', color: '#eab308', icon: '💡' },
  { name: 'Vivienda', color: '#6366f1', icon: '🏠' },
  { name: FALLBACK_CATEGORY_NAME, color: '#94a3b8', icon: '🏷️', isFallback: true },
];
