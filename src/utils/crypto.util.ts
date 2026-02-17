// src/common/utils/password.util.ts - WORKING VERSION
import * as argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {

  return await argon2.hash(password, {
   
    hashLength: 32,
    timeCost: 3,
    memoryCost: 65536,
    parallelism: 4,
    
  });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}