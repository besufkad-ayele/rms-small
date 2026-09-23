import bcrypt from "bcryptjs";
import { db } from "./db";
import type { AuthSession, BusinessProfile, UserAccount } from "./types";
import { uid } from "./utils";

const SALT_ROUNDS = 10;

export async function isSetupComplete(): Promise<boolean> {
  const count = await db.users.count();
  return count > 0;
}

export async function getSession(): Promise<AuthSession | undefined> {
  return db.session.get("current");
}

export async function logout(): Promise<void> {
  await db.session.delete("current");
}

export async function setupAccount(input: {
  businessName: string;
  phone: string;
  address: string;
  username: string;
  password: string;
  displayName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isSetupComplete()) {
    return { ok: false, error: "Account already exists on this device." };
  }
  if (input.password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const now = new Date().toISOString();

  const business: BusinessProfile = {
    id: uid("biz"),
    name: input.businessName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    tin: "—",
    vatNumber: "—",
    currency: "ETB",
    createdAt: now,
    lastSyncedAt: null,
  };

  const user: UserAccount = {
    id: uid("user"),
    username: input.username.trim().toLowerCase(),
    passwordHash,
    displayName: input.displayName.trim() || input.username.trim(),
    createdAt: now,
  };

  const session: AuthSession = {
    id: "current",
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    loggedInAt: now,
  };

  await db.transaction("rw", db.business, db.users, db.session, async () => {
    await db.business.put(business);
    await db.users.put(user);
    await db.session.put(session);
  });

  return { ok: true };
}

export async function login(
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await db.users
    .where("username")
    .equals(username.trim().toLowerCase())
    .first();

  if (!user) {
    return { ok: false, error: "Invalid username or password." };
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return { ok: false, error: "Invalid username or password." };
  }

  const session: AuthSession = {
    id: "current",
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    loggedInAt: new Date().toISOString(),
  };
  await db.session.put(session);
  return { ok: true };
}

export async function getBusiness(): Promise<BusinessProfile | undefined> {
  return db.business.toCollection().first();
}
