import 'reflect-metadata';
import { touched } from './base.entity.js';

describe('touched', () => {
    it('stamps modifiedAt on a partial update', () => {
        const before = Date.now();

        const partial = touched({ name: 'Copa' });

        expect(partial.name).toBe('Copa');
        expect(partial.modifiedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
});
