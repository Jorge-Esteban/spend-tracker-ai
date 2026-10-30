import { describe, expect, it } from 'vitest';
import { csvField, toCsv } from '../../src/modules/expenses/csv.js';

describe('csvField', () => {
  it('escapa separadores, comillas y saltos de línea', () => {
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(csvField('línea\notra')).toBe('"línea\notra"');
    expect(csvField(null)).toBe('');
  });

  it.each(['=SUMA(A1)', '+34', '-1', '@cmd'])('neutraliza la fórmula %s', (v) => {
    expect(csvField(v).startsWith("'")).toBe(true);
  });
});

describe('toCsv', () => {
  it('genera BOM, cabecera, coma decimal y origen legible', () => {
    const csv = toCsv([
      {
        date: new Date('2026-03-05T00:00:00Z'),
        description: 'Compra; semanal',
        merchant: 'Mercadona',
        amountCents: 4599,
        currency: 'EUR',
        source: 'BANK',
        category: { name: 'Comida' },
      },
      {
        date: new Date('2026-03-06T00:00:00Z'),
        description: 'Café',
        merchant: null,
        amountCents: 5,
        currency: 'EUR',
        source: 'MANUAL',
      },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('fecha;descripcion;comercio;categoria;importe;moneda;origen');
    expect(lines[1]).toBe('2026-03-05;"Compra; semanal";Mercadona;Comida;45,99;EUR;banco');
    expect(lines[2]).toBe('2026-03-06;Café;;;0,05;EUR;manual');
  });
});
