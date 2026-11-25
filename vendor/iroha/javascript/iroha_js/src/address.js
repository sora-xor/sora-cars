import { createAccountAddressApi } from "./addressCodec.js";
import { AccountAddressError, AccountAddressErrorCode } from "./addressErrors.js";
import { defaultNativeRuntime, resolveNativeRuntimeBinding } from "./nativeRuntime.js";
export { AccountAddressError, AccountAddressErrorCode } from "./addressErrors.js";
export {
  curveIdFromAlgorithm, curveIdToAlgorithm, ensureCurveIdEnabled, normalizeBytes,
} from "./addressPrimitives.js";

// Node always uses the authenticated Rust owner; a missing binding never
// selects browser admission as a fallback.
function admitNativeCanonical(canonical) {
  const native = resolveNativeRuntimeBinding(defaultNativeRuntime);
  if (typeof native.accountAddressRender !== "function") {
    throw new Error("Native binding required; accountAddressRender is unavailable");
  }
  let rendered;
  try {
    rendered = native.accountAddressRender(canonical, 0x02f1);
  } catch (cause) {
    const code = /^([A-Z_]+): /u.exec(cause?.message ?? "")?.[1];
    if (Object.values(AccountAddressErrorCode).includes(code)) {
      throw new AccountAddressError(code, cause.message, { cause });
    }
    throw cause;
  }
  const hex = Array.from(canonical, byte => byte.toString(16).padStart(2, "0")).join("");
  if (rendered?.canonicalHex !== `0x${hex}`) {
    throw new AccountAddressError(AccountAddressErrorCode.INVALID_PUBLIC_KEY,
      "native address admission did not preserve the exact canonical bytes");
  }
}

export const {
  AccountAddress, accountControllerFromAddress, parseCanonicalI105AccountLiteral,
  encodeI105AccountAddress, decodeI105AccountAddress, inspectAccountId,
  validatePublicKeyForCurve,
} = createAccountAddressApi(admitNativeCanonical);
