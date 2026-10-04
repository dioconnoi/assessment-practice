import { randomBytes, scrypt, timingSafeEqual } from "crypto";

// No "server-only" marker here (unlike the rest of lib/): this needs to be
// importable from scripts/seed.ts, which runs under tsx outside Next's
// bundler, where the "server-only" package's throw-always stub would fire
// even though nothing client-side is involved. Node's own `crypto` import
// already makes this unbundleable into a client component.

const KEY_LENGTH = 64;

// Node's built-in scrypt instead of bcrypt/argon2 — no native addon to
// compile, which matters on a small Alpine-based Docker image.
export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      const keyBuffer = Buffer.from(key, "hex");
      if (keyBuffer.length !== derivedKey.length) return resolve(false);
      resolve(timingSafeEqual(keyBuffer, derivedKey));
    });
  });
}
