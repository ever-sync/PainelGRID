import { assertMetaGraphUrl, assertMetaMediaUrl } from './meta-url.util';

describe('Meta outbound URL policy', () => {
  it('aceita Graph API oficial', () => {
    expect(assertMetaGraphUrl('https://graph.facebook.com/v23.0/me?fields=id').hostname).toBe(
      'graph.facebook.com',
    );
  });

  it.each([
    'http://graph.facebook.com/v23.0/me',
    'https://graph.facebook.com.evil.example/v23.0/me',
    'https://evil.example/v23.0/me',
    'https://user:pass@graph.facebook.com/v23.0/me',
    'https://graph.facebook.com:8443/v23.0/me',
  ])('rejeita destino Graph inseguro: %s', (url) => {
    expect(() => assertMetaGraphUrl(url)).toThrow('nao permitido');
  });

  it.each([
    'https://lookaside.fbsbx.com/whatsapp_business/attachments/example',
    'https://lookaside.facebook.com/example',
    'https://scontent-gru2-2.xx.fbcdn.net/example',
    'https://graph.facebook.com/v23.0/media-id',
  ])('aceita host oficial de midia: %s', (url) => {
    expect(() => assertMetaMediaUrl(url)).not.toThrow();
  });

  it.each([
    'http://lookaside.fbsbx.com/example',
    'https://fbsbx.com.evil.example/example',
    'https://fbcdn.net.evil.example/example',
    'https://127.0.0.1/media',
    'https://169.254.169.254/latest/meta-data',
  ])('rejeita destino de midia inseguro: %s', (url) => {
    expect(() => assertMetaMediaUrl(url)).toThrow('nao permitido');
  });
});
