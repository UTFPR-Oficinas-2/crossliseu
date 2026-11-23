import { nameKey } from './name-key.js';

describe('nameKey', () => {
    it.each([
        [' João ', 'joao'],
        ['JOÃO', 'joao'],
        ['İsa', 'isa'],
        ['Ana  Lu', 'ana lu'],
        ['Conceição', 'conceicao'],
        ['́', ''],
    ])('%j → %j', (name, key) => {
        expect(nameKey(name)).toBe(key);
    });
});
