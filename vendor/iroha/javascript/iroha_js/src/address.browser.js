import { createAccountAddressApi } from "./addressCodec.js";
import { assertCanonicalAccountPublicKey } from "./accountKeyAdmission.browser.js";
export { AccountAddressError, AccountAddressErrorCode } from "./addressErrors.js";
export {
  curveIdFromAlgorithm, curveIdToAlgorithm, ensureCurveIdEnabled, normalizeBytes,
} from "./addressPrimitives.js";

// This is the browser's primary admission implementation. The shared codec
// checks the complete controller, exact ordering and encoding before this
// callback validates each key using the native algorithms' admission rules.
function admitBrowserController(_canonical, controller) {
  if (controller.tag === 0) {
    assertCanonicalAccountPublicKey(controller.curve, controller.publicKey);
  } else {
    for (const member of controller.members) {
      assertCanonicalAccountPublicKey(member.curve, member.publicKey);
    }
  }
}

export const {
  AccountAddress, accountControllerFromAddress, parseCanonicalI105AccountLiteral,
  encodeI105AccountAddress, decodeI105AccountAddress, inspectAccountId,
  validatePublicKeyForCurve,
} = createAccountAddressApi(admitBrowserController);
