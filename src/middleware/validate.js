import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Id no válido');

export const idParams = z.object({ id: objectId });
