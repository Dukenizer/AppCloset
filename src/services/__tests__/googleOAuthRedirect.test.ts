import { googleOAuthRedirectUri, googleOAuthRedirectScheme } from '@/services/drive/googleOAuthRedirect';

describe('googleOAuthRedirect', () => {
  const clientId = '123456789012-abcdefghijklmnop.apps.googleusercontent.com';

  it('builds the reverse-client redirect URI Google expects', () => {
    expect(googleOAuthRedirectUri(clientId)).toBe(
      'com.googleusercontent.apps.123456789012-abcdefghijklmnop:/oauth2redirect/google',
    );
  });

  it('builds the URL scheme for native intent filters', () => {
    expect(googleOAuthRedirectScheme(clientId)).toBe(
      'com.googleusercontent.apps.123456789012-abcdefghijklmnop',
    );
  });

  it('returns empty for invalid client ids', () => {
    expect(googleOAuthRedirectUri('not-a-client')).toBe('');
  });
});
