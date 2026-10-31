// Categorías que se crean al registrarse. Cada tipo tiene su categoría de reserva,
// que no se puede borrar y recibe lo que no encaja en otra.
export const FALLBACK_NAMES = { EXPENSE: 'Otros', INCOME: 'Otros ingresos' };

export const DEFAULT_CATEGORIES = [
  { name: 'Comida', color: '#f97316', icon: '🍽️' },
  { name: 'Transporte', color: '#0ea5e9', icon: '🚌' },
  { name: 'Ocio', color: '#a855f7', icon: '🎬' },
  { name: 'Salud', color: '#10b981', icon: '💊' },
  { name: 'Compras', color: '#ec4899', icon: '🛍️' },
  { name: 'Servicios', color: '#eab308', icon: '💡' },
  { name: 'Vivienda', color: '#6366f1', icon: '🏠' },
  { name: FALLBACK_NAMES.EXPENSE, color: '#94a3b8', icon: '🏷️', isFallback: true },
  { name: 'Nómina', color: '#16a34a', icon: '💼', kind: 'INCOME' },
  { name: 'Reembolsos', color: '#0d9488', icon: '↩️', kind: 'INCOME' },
  { name: FALLBACK_NAMES.INCOME, color: '#65a30d', icon: '💰', kind: 'INCOME', isFallback: true },
];
