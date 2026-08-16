import { redactValue } from '@/services/debugLog';

describe('debugLog redactValue', () => {
  it('strips bearer tokens and ya29 access tokens from strings', () => {
    expect(redactValue('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [redacted]');
    expect(redactValue('token=ya29.a0ATt_secret-value')).toBe('token=[redacted-token]');
  });

  it('redacts secret-looking object keys', () => {
    expect(
      redactValue({
        accessToken: 'secret',
        refreshToken: 'also',
        Authorization: 'Bearer x',
        fileSize: 12,
      }),
    ).toEqual({
      accessToken: '[redacted]',
      refreshToken: '[redacted]',
      Authorization: '[redacted]',
      fileSize: 12,
    });
  });
});
