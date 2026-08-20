(function (root) {
  "use strict";

  const CODES = Object.freeze({
    DEVICE_OFFLINE: "DEVICE_OFFLINE",
    API_NOT_CONFIGURED: "API_NOT_CONFIGURED",
    API_UNREACHABLE: "API_UNREACHABLE",
    CORS_OR_POLICY_BLOCK: "CORS_OR_POLICY_BLOCK",
    REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
    HTTP_CLIENT_ERROR: "HTTP_CLIENT_ERROR",
    HTTP_SERVER_ERROR: "HTTP_SERVER_ERROR",
    PROVIDER_NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
    PROVIDER_RATE_LIMITED: "PROVIDER_RATE_LIMITED",
    PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
    INVALID_PROVIDER_RESPONSE: "INVALID_PROVIDER_RESPONSE",
    IMAGE_INVALID: "IMAGE_INVALID",
    IMAGE_TOO_LARGE: "IMAGE_TOO_LARGE",
    IMAGE_UNSUPPORTED: "IMAGE_UNSUPPORTED",
    IMAGE_DECODE_FAILED: "IMAGE_DECODE_FAILED",
    OCR_LOCAL_UNAVAILABLE: "OCR_LOCAL_UNAVAILABLE",
    OCR_LOCAL_FAILED: "OCR_LOCAL_FAILED",
    OCR_PROVIDER_FAILED: "OCR_PROVIDER_FAILED",
    OCR_EMPTY_TEXT: "OCR_EMPTY_TEXT",
    TRANSLATION_FAILED: "TRANSLATION_FAILED",
    PARSER_FAILED: "PARSER_FAILED",
    ENGINE_FAILED: "ENGINE_FAILED",
    PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
    PRODUCT_DATA_INVALID: "PRODUCT_DATA_INVALID",
    STORAGE_FAILED: "STORAGE_FAILED",
    SESSION_CANCELLED: "SESSION_CANCELLED",
    UNKNOWN_ERROR: "UNKNOWN_ERROR",
  });

  const HTTP_MAP = Object.freeze({
    400: CODES.HTTP_CLIENT_ERROR,
    401: CODES.PROVIDER_NOT_CONFIGURED,
    403: CODES.PROVIDER_NOT_CONFIGURED,
    404: CODES.PRODUCT_NOT_FOUND,
    408: CODES.REQUEST_TIMEOUT,
    413: CODES.IMAGE_TOO_LARGE,
    415: CODES.IMAGE_UNSUPPORTED,
    429: CODES.PROVIDER_RATE_LIMITED,
    502: CODES.PROVIDER_UNAVAILABLE,
    503: CODES.PROVIDER_UNAVAILABLE,
    504: CODES.REQUEST_TIMEOUT,
  });

  function isDeviceOffline() {
    return root["navigator"]?.["onLine"] === false || root.ROOTS_CONNECTIVITY?.get?.().offline === true;
  }

  function publicMessage(code) {
    switch (code) {
      case CODES.DEVICE_OFFLINE:
        return "This device is offline. Use cached product data, local label reading if available, or enter ingredients manually.";
      case CODES.API_NOT_CONFIGURED:
        return "Label scanning is not configured for this build. Enter ingredients manually or configure the ROOTS API.";
      case CODES.API_UNREACHABLE:
        return "The ROOTS API is unavailable. The internet may still be working; start the local backend or try again later.";
      case CODES.CORS_OR_POLICY_BLOCK:
        return "The ROOTS API request was blocked by app policy. Check the API origin, CSP, and backend CORS settings.";
      case CODES.REQUEST_TIMEOUT:
        return "The request took too long. Try again, or enter the ingredients manually.";
      case CODES.PROVIDER_NOT_CONFIGURED:
        return "The label-reading provider is not configured on the ROOTS API.";
      case CODES.PROVIDER_RATE_LIMITED:
        return "Too many scan attempts. Wait a moment, then try again.";
      case CODES.PROVIDER_UNAVAILABLE:
      case CODES.OCR_PROVIDER_FAILED:
        return "The online label reader is unavailable. Try again, use local OCR if available, or enter ingredients manually.";
      case CODES.IMAGE_TOO_LARGE:
        return "The photo is too large. Crop the ingredient label or choose a smaller image.";
      case CODES.IMAGE_UNSUPPORTED:
        return "Choose a JPEG, PNG, or WebP image.";
      case CODES.IMAGE_DECODE_FAILED:
      case CODES.IMAGE_INVALID:
        return "That photo could not be opened. Choose another image or enter ingredients manually.";
      case CODES.OCR_LOCAL_UNAVAILABLE:
        return "Offline text recognition is unavailable on this device. Enter ingredients manually.";
      case CODES.OCR_EMPTY_TEXT:
        return "No ingredient list was detected. Adjust the crop or enter the ingredients manually.";
      case CODES.PRODUCT_NOT_FOUND:
        return "ROOTS could not find this barcode in the available product database. Scan the ingredient label instead.";
      default:
        return "ROOTS could not finish this request. Try again or enter the ingredients manually.";
    }
  }

  function fromHttpStatus(status) {
    const numeric = Number(status) || 0;
    return HTTP_MAP[numeric] || (numeric >= 500 ? CODES.HTTP_SERVER_ERROR : CODES.HTTP_CLIENT_ERROR);
  }

  function classifyFetchError(error) {
    if (error?.name === "AbortError") return CODES.SESSION_CANCELLED;
    if (error?.code === "NETWORK_TIMEOUT" || error?.code === CODES.REQUEST_TIMEOUT) return CODES.REQUEST_TIMEOUT;
    if (isDeviceOffline()) return CODES.DEVICE_OFFLINE;
    if (error?.name === "TypeError") return CODES.CORS_OR_POLICY_BLOCK;
    return CODES.API_UNREACHABLE;
  }

  function create(code, message, metadata) {
    const safeCode = CODES[code] || code || CODES.UNKNOWN_ERROR;
    const err = new Error(message || publicMessage(safeCode));
    err.code = safeCode;
    err.publicMessage = publicMessage(safeCode);
    err.debugMetadata = metadata || {};
    return err;
  }

  root.ROOTS_ERRORS = Object.freeze({ CODES, publicMessage, fromHttpStatus, classifyFetchError, create, isDeviceOffline });
})(typeof window !== "undefined" ? window : globalThis);
