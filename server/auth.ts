// Local email + password accounts. Passwords are hashed with scrypt; sessions are a signed,
// HttpOnly cookie, so no server-side session store is needed (works on serverless hosts).
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import * as db from './db.js';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const COOKIE = 'pc_session';
const MAX_AGE_S = 30 * 24 * 3600;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

/** SESSION_SECRET in production; otherwise a random secret persisted in the database. */
let cachedSecret: string | null = null;
async function secret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  let s = await db.getSetting('session_secret');
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    await db.setSetting('session_secret', s);
  }
  return (cachedSecret = s);
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const sign = async (payload: string) => crypto.createHmac('sha256', await secret()).update(payload).digest('base64url');

export async function makeToken(userId: number): Promise<string> {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S })).toString('base64url');
  return `${payload}.${await sign(payload)}`;
}

export async function readToken(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof uid !== 'number' || typeof exp !== 'number' || exp < Date.now() / 1000) return null;
    return uid;
  } catch {
    return null;
  }
}

function cookieValue(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

const secure = (req: Request) => req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';

export async function setSession(req: Request, res: Response, userId: number) {
  res.setHeader('Set-Cookie', `${COOKIE}=${await makeToken(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure(req) ? '; Secure' : ''}`);
}

export function clearSession(req: Request, res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(req) ? '; Secure' : ''}`);
}

/** Attach req.userId when a valid session exists; the user must still exist. */
export async function sessionUser(req: Request): Promise<number | null> {
  const uid = await readToken(cookieValue(req, COOKIE));
  return uid && (await db.getUser(uid)) ? uid : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const uid = await sessionUser(req);
  if (!uid) {
    res.status(401).json({ error: 'Please sign in' });
    return;
  }
  req.userId = uid;
  next();
}

// Simple in-memory throttle against password guessing (per email + IP).
const attempts = new Map<string, { n: number; until: number }>();
export function throttled(key: string): boolean {
  const a = attempts.get(key);
  return !!a && a.n >= 8 && a.until > Date.now();
}
export function recordFailure(key: string) {
  const a = attempts.get(key);
  const fresh = !a || a.until < Date.now();
  attempts.set(key, { n: fresh ? 1 : a!.n + 1, until: Date.now() + 15 * 60_000 });
}
export function clearFailures(key: string) {
  attempts.delete(key);
}

export const publicUser = (u: db.User) => ({ id: u.id, email: u.email, name: u.name });
