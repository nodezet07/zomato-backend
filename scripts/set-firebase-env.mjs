import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const saPath = path.join(__dirname, '_firebase-sa-temp.json');
const envPath = path.join(__dirname, '..', '.env');

const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
const b64 = Buffer.from(JSON.stringify(sa)).toString('base64');

let env = fs.readFileSync(envPath, 'utf8');

const lines = {
  FIREBASE_ENABLED: 'true',
  FIREBASE_PROJECT_ID: sa.project_id,
  FIREBASE_CLIENT_EMAIL: sa.client_email,
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: b64,
};

for (const [key, value] of Object.entries(lines)) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(env)) {
    env = env.replace(re, `${key}=${value}`);
  } else if (key.startsWith('FIREBASE_')) {
    env = env.replace(
      /(# Firebase \(FCM push for Capacitor apps\)\n)/,
      `$1${key}=${value}\n`,
    );
  }
}

fs.writeFileSync(envPath, env);
console.log('Firebase env updated. base64 length:', b64.length);
