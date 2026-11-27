import { beforeEach, describe, expect, it } from 'vitest';
import { LISTS_KEY } from '../services/list-store';
import { WORD_BLOCKS, WordBlock, pairKey } from './word-catalog';
import { WordLibrary } from './word-library';

const SPACE: WordBlock = {
  id: 'egen-rymden',
  name: 'Rymden',
  words: [
    { en: 'moon', sv: 'måne' },
    { en: 'star', sv: 'stjärna' },
  ],
};

describe('WordLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('börjar med byggets listor', () => {
    const library = new WordLibrary();
    expect(library.blocks).toEqual(WORD_BLOCKS);
  });

  it('lägger en egen lista sist, så att den nyaste är den sista', () => {
    const library = new WordLibrary();
    library.add(SPACE);

    expect(library.blocks.at(-1)).toEqual(SPACE);
    expect(library.byId(SPACE.id)).toEqual(SPACE);
    expect(library.isOwn(SPACE.id)).toBe(true);
    expect(library.isOwn(WORD_BLOCKS[0].id)).toBe(false);
  });

  it('svarar null på ett id som inte finns', () => {
    const library = new WordLibrary();
    expect(library.byId('finns-inte')).toBeNull();
    expect(library.byId(null)).toBeNull();
  });

  it('låter repetitionen nå den egna listans ord', () => {
    const library = new WordLibrary();
    library.add(SPACE);
    expect(library.words.map(pairKey)).toContain(pairKey(SPACE.words[0]));
  });

  it('räknar en glosa en gång även när den står i två listor', () => {
    const library = new WordLibrary();
    const shared = WORD_BLOCKS[0].words[0];
    library.add({ id: 'egen-dubbel', name: 'Dubbel', words: [shared] });

    const keys = library.words.map(pairKey);
    expect(keys.filter((key) => key === pairKey(shared))).toHaveLength(1);
  });

  it('minns en egen lista till nästa besök', () => {
    new WordLibrary().add(SPACE);
    expect(new WordLibrary().byId(SPACE.id)).toEqual(SPACE);
  });

  it('tar bort en egen lista men aldrig en som kom med bygget', () => {
    const library = new WordLibrary();
    library.add(SPACE);
    library.remove(SPACE.id);
    library.remove(WORD_BLOCKS[0].id);

    expect(library.byId(SPACE.id)).toBeNull();
    expect(library.byId(WORD_BLOCKS[0].id)).not.toBeNull();
    expect(new WordLibrary().byId(SPACE.id)).toBeNull();
  });

  it('låter aldrig en egen lista ta en bygglistas plats', () => {
    const library = new WordLibrary();
    const original = WORD_BLOCKS[0];
    library.add({ ...SPACE, id: original.id });
    expect(library.byId(original.id)).toEqual(original);
  });

  it('går att öva i även när lagret innehåller skräp', () => {
    localStorage.setItem(LISTS_KEY, '{inte json');
    expect(new WordLibrary().blocks).toEqual(WORD_BLOCKS);

    localStorage.setItem(LISTS_KEY, JSON.stringify({ blocks: [17, { id: 'x' }, SPACE] }));
    expect(new WordLibrary().blocks.at(-1)).toEqual(SPACE);
  });
});
