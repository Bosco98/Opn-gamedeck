// No ambiguous characters (I, O, 0, 1) — codes get read off a screen and typed.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(length = 4): string {
  let code = "";
  const random = new Uint32Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(random);
  } else {
    for (let i = 0; i < length; i++) random[i] = Math.floor(Math.random() * 0xffffffff);
  }
  for (let i = 0; i < length; i++) {
    code += ALPHABET[random[i] % ALPHABET.length];
  }
  return code;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}
