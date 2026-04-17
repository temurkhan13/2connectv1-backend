/**
 * SNS signature verification for incoming SES → SNS → HTTP(S) webhooks.
 *
 * AWS signs every SNS message with an RSA signature. The signing cert is
 * downloaded from `SigningCertURL` (must be an amazonaws.com host) and
 * the canonical string-to-sign is assembled from specific fields in a
 * fixed order depending on message Type.
 *
 * Docs: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 */
import * as crypto from 'crypto';
import * as https from 'https';
import { URL } from 'url';

export interface SnsMessage {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: '1' | '2';
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
  UnsubscribeURL?: string;
}

const certCache = new Map<string, string>();
const MAX_CERT_BYTES = 32 * 1024;

function fetchCert(url: string): Promise<string> {
  const cached = certCache.get(url);
  if (cached) return Promise.resolve(cached);

  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    return Promise.reject(new Error(`SNS cert URL must be https, got ${parsed.protocol}`));
  }
  // AWS publishes signing certs under sns.<region>.amazonaws.com. Refuse
  // anything else to prevent a forged-url + attacker-cert bypass.
  if (!/\.amazonaws\.com$/.test(parsed.hostname)) {
    return Promise.reject(new Error(`SNS cert URL host not under amazonaws.com: ${parsed.hostname}`));
  }

  return new Promise<string>((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`SNS cert fetch status ${res.statusCode}`));
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_CERT_BYTES) {
          req.destroy();
          reject(new Error('SNS cert exceeds max size'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        const cert = Buffer.concat(chunks).toString('utf8');
        certCache.set(url, cert);
        resolve(cert);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('SNS cert fetch timeout'));
    });
  });
}

function buildStringToSign(msg: SnsMessage): string {
  // Fields must appear in alphabetical order, each "FieldName\nFieldValue\n"
  let fields: string[];
  if (msg.Type === 'Notification') {
    fields = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
  } else {
    // SubscriptionConfirmation / UnsubscribeConfirmation
    fields = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  }
  let out = '';
  for (const f of fields) {
    const v = (msg as any)[f];
    if (v === undefined || v === null) continue;
    out += `${f}\n${v}\n`;
  }
  return out;
}

export async function verifySnsSignature(msg: SnsMessage): Promise<boolean> {
  if (!msg.Signature || !msg.SigningCertURL) return false;

  const cert = await fetchCert(msg.SigningCertURL);
  const algo = msg.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  const verifier = crypto.createVerify(algo);
  verifier.update(buildStringToSign(msg), 'utf8');
  return verifier.verify(cert, msg.Signature, 'base64');
}

/**
 * GET the SubscribeURL to auto-confirm an SNS HTTP(S) subscription.
 * Returns true on 2xx.
 */
export function confirmSnsSubscription(url: string): Promise<boolean> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    return Promise.reject(new Error('SubscribeURL must be https'));
  }
  if (!/\.amazonaws\.com$/.test(parsed.hostname)) {
    return Promise.reject(new Error(`SubscribeURL host not under amazonaws.com: ${parsed.hostname}`));
  }
  return new Promise<boolean>((resolve, reject) => {
    const req = https.get(url, (res) => {
      const ok = (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300;
      res.resume(); // drain
      resolve(ok);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('SubscribeURL confirmation timeout'));
    });
  });
}
