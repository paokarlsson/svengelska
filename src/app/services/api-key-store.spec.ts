import { beforeEach, describe, expect, it } from 'vitest';
import { API_KEY_KEY, ApiKeyStore, cleanKey } from './api-key-store';
import { PROGRESS_KEY } from './progress-store';

describe('cleanKey', () => {
  it('tar bort det en inklistring drar med sig', () => {
    expect(cleanKey('  sk-ant-abc\n')).toBe('sk-ant-abc');
    expect(cleanKey('sk-ant-\nabc')).toBe('sk-ant-abc');
  });

  it('ger null när ingenting klistrades in', () => {
    expect(cleanKey('')).toBeNull();
    expect(cleanKey(' \n\t')).toBeNull();
  });
});

describe('ApiKeyStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('har ingen nyckel från början', () => {
    const store = new ApiKeyStore();
    expect(store.hasKey).toBe(false);
    expect(store.key).toBeNull();
    expect(store.hint).toBeNull();
  });

  it('minns nyckeln till nästa besök', () => {
    expect(new ApiKeyStore().save(' sk-ant-hemlig-1234 ')).toBe(true);
    expect(new ApiKeyStore().key).toBe('sk-ant-hemlig-1234');
  });

  it('sparar inte en tom nyckel', () => {
    const store = new ApiKeyStore();
    expect(store.save('   ')).toBe(false);
    expect(store.hasKey).toBe(false);
  });

  it('visar bara slutet av nyckeln', () => {
    const store = new ApiKeyStore();
    store.save('sk-ant-hemlig-1234');
    expect(store.hint).toBe('…1234');
    expect(store.hint).not.toContain('hemlig');
  });

  it('glömmer nyckeln när den tas bort', () => {
    const store = new ApiKeyStore();
    store.save('sk-ant-hemlig-1234');
    store.clear();

    expect(store.hasKey).toBe(false);
    expect(new ApiKeyStore().hasKey).toBe(false);
  });

  // Ett framstegsdokument som exporteras eller delas ska inte bära en hemlighet.
  it('ligger aldrig i framstegsdokumentet', () => {
    new ApiKeyStore().save('sk-ant-hemlig-1234');
    expect(API_KEY_KEY).not.toBe(PROGRESS_KEY);
    expect(localStorage.getItem(PROGRESS_KEY) ?? '').not.toContain('sk-ant-hemlig-1234');
  });
});
