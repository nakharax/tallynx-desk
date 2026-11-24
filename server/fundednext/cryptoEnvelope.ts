import { createCipheriv, createDecipheriv, createSign, randomBytes } from 'node:crypto';

const algorithm = 'aes-256-gcm';

export interface FundedNextCredentialEnvelope {
  ciphertext: string;
  encryptedDek: string;
  iv: string;
  authTag: string;
  kmsKeyVersion: string;
  algorithm: typeof algorithm;
  createdAt: string;
  tokenExpiresAt: number;
}

export interface FundedNextTokens {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: number;
  clientId?: string;
  clientSecret?: string;
}

export interface KmsCipherProvider {
  encryptDek(dek: Buffer): Promise<{ encryptedDek: string; kmsKeyVersion: string }>;
  decryptDek(encryptedDek: string, kmsKeyVersion: string): Promise<Buffer>;
}

export class LocalAesGcmKmsProvider implements KmsCipherProvider {
  private readonly key: Buffer;

  constructor(masterKey?: Buffer, private readonly keyVersion = 'local/1') {
    const key = masterKey ?? (process.env.NODE_ENV === 'test' ? Buffer.alloc(32, 1) : undefined);
    if (key?.length !== 32) throw new Error('A 32-byte local master key is required');
    this.key = Buffer.from(key);
  }

  async encryptDek(dek: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
    return {
      encryptedDek: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64'),
      kmsKeyVersion: this.keyVersion,
    };
  }

  async decryptDek(encryptedDek: string, kmsKeyVersion: string) {
    const bytes = Buffer.from(encryptedDek, 'base64');
    if (kmsKeyVersion !== this.keyVersion || bytes.length !== 60) throw new Error('Invalid wrapped key');
    const decipher = createDecipheriv(algorithm, this.key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  }
}

export class GcpCloudKmsProvider implements KmsCipherProvider {
  constructor(private readonly options: { keyName: string; getAccessToken: () => Promise<string>; fetch?: typeof fetch }) {
    if (!/^projects\/[\w-]+\/locations\/asia-southeast1\/keyRings\/[\w-]+\/cryptoKeys\/[\w-]+$/.test(options.keyName)) {
      throw new Error('Cloud KMS requires an asia-southeast1 CryptoKey resource name');
    }
  }

  private validVersion(name: unknown): name is string {
    const prefix = this.options.keyName + '/cryptoKeyVersions/';
    return typeof name === 'string' && name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length));
  }

  private async request(operation: 'encrypt' | 'decrypt', body: Record<string, string>) {
    const request = this.options.fetch ?? fetch;
    const response = await request('https://asia-southeast1-cloudkms.googleapis.com/v1/' + this.options.keyName + ':' + operation, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + await this.options.getAccessToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Cloud KMS request failed');
    return await response.json() as { name?: string; ciphertext?: string; plaintext?: string };
  }

  async encryptDek(dek: Buffer) {
    const result = await this.request('encrypt', { plaintext: dek.toString('base64') });
    if (!this.validVersion(result.name) || !result.ciphertext) throw new Error('Invalid Cloud KMS encryption response');
    return { kmsKeyVersion: result.name, encryptedDek: result.ciphertext };
  }

  async decryptDek(encryptedDek: string, kmsKeyVersion: string) {
    if (!this.validVersion(kmsKeyVersion)) throw new Error('Invalid Cloud KMS key version');
    const result = await this.request('decrypt', { ciphertext: encryptedDek });
    if (!result.plaintext) throw new Error('Invalid Cloud KMS decryption response');
    return Buffer.from(result.plaintext, 'base64');
  }
}

function tokenPayload(value: FundedNextTokens): FundedNextTokens {
  if (!value || typeof value.accessToken !== 'string' || !value.accessToken ||
      !Number.isSafeInteger(value.tokenExpiresAt) || value.tokenExpiresAt < 0) {
    throw new Error('Invalid credential payload');
  }
  const tokens: FundedNextTokens = { accessToken: value.accessToken, tokenExpiresAt: value.tokenExpiresAt };
  for (const key of ['refreshToken', 'clientId', 'clientSecret'] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string') throw new Error('Invalid credential payload');
      tokens[key] = value[key];
    }
  }
  return tokens;
}

function envelopeMetadata(value: Pick<FundedNextCredentialEnvelope, 'algorithm' | 'createdAt' | 'tokenExpiresAt' | 'kmsKeyVersion'>) {
  return Buffer.from(JSON.stringify([value.algorithm, value.createdAt, value.tokenExpiresAt, value.kmsKeyVersion]));
}

export class KmsEnvelopeCipher {
  constructor(private readonly provider: KmsCipherProvider, private readonly now: () => number = Date.now) {}

  async encryptTokens(plaintextTokens: FundedNextTokens): Promise<FundedNextCredentialEnvelope> {
    const tokens = tokenPayload(plaintextTokens);
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const plaintext = Buffer.from(JSON.stringify(tokens));
    try {
      const metadata = {
        ...await this.provider.encryptDek(dek), algorithm,
        createdAt: new Date(this.now()).toISOString(), tokenExpiresAt: tokens.tokenExpiresAt,
      } as const;
      const cipher = createCipheriv(algorithm, dek, iv);
      cipher.setAAD(envelopeMetadata(metadata));
      return {
        ...metadata,
        ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
      };
    } finally {
      plaintext.fill(0);
      dek.fill(0);
    }
  }

  async decryptTokens(envelope: FundedNextCredentialEnvelope): Promise<FundedNextTokens> {
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.authTag, 'base64');
    if (envelope.algorithm !== algorithm || iv.length !== 12 || tag.length !== 16) throw new Error('Invalid credential envelope');
    const dek = await this.provider.decryptDek(envelope.encryptedDek, envelope.kmsKeyVersion);
    let plaintext: Buffer | undefined;
    try {
      const decipher = createDecipheriv(algorithm, dek, iv);
      decipher.setAAD(envelopeMetadata(envelope));
      decipher.setAuthTag(tag);
      plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
      return tokenPayload(JSON.parse(plaintext.toString('utf8')));
    } finally {
      plaintext?.fill(0);
      dek.fill(0);
    }
  }
}

export function redactSecrets(text: string): string {
  return text
    .replace(/(\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|code[_-]?verifier)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:Bearer\s+)?[^\s&,;"'{}\]]+)/gi, '$1[REDACTED]')
    .replace(/\bBearer[ \t]+[^\s&,;"'{}\]]+/gi, 'Bearer [REDACTED]');
}

export function createGoogleAccessTokenSource(serviceAccountJson?: string): () => Promise<string> {
  const account = serviceAccountJson ? JSON.parse(serviceAccountJson) as { client_email?: string; private_key?: string } : undefined;
  if (account && (!account.client_email || !account.private_key)) throw new Error('Invalid Google service account configuration');
  let cached: { token: string; expiresAt: number } | undefined;
  let pending: Promise<string> | undefined;

  async function obtainToken() {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const signal = AbortSignal.timeout(10_000);
    let response: Response;
    if (account?.client_email && account.private_key) {
      const now = Math.floor(Date.now() / 1000);
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const claims = encode({ iss: account.client_email, aud: tokenUrl, iat: now, exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/cloud-platform' });
      const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + claims;
      const assertion = unsigned + '.' + createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
      response = await fetch(tokenUrl, {
        method: 'POST', redirect: 'error', signal,
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      });
    } else {
      response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
        headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error', signal,
      });
    }
    if (!response.ok) throw new Error('Google service authentication failed');
    const result = await response.json() as { access_token?: string; expires_in?: number };
    if (!result.access_token || !Number.isFinite(result.expires_in)) throw new Error('Invalid Google service authentication response');
    cached = { token: result.access_token, expiresAt: Date.now() + Number(result.expires_in) * 1000 };
    return cached.token;
  }

  return async () => {
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
    pending ??= obtainToken().finally(() => { pending = undefined; });
    return pending;
  };
}
