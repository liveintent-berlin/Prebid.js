/**
 * This module adds tracking support for LiveIntent's LiveConnect
 * @module modules/liveConnect
 */

/**
 * @typedef {Object} LiveConnectStorageConfig
 * @property {string} type - specifies where to store the liveConnect identifier. Allowed values: "cookie" or "html5" (local storage). Default: "cookie"
 * @property {number} expires - number of days to store the liveConnect identifier. Default: 30
 */

/**
 * @typedef {Object} LiveConnectConfig
 * @property {(string[]|undefined)} scrapedIdentifiers - cookie names or local storage item names to be sent along with the tracking request
 * @property {(string|undefined)} providedFirstPartyIdentifier - the cookie name or the local storage item name of the provided first party identifier
 * @property {LiveConnectStorageConfig} storage - specifies way to store the liveConnect identifier
 */

/**
 * @typedef {Object} NotValidatedLiveConnectStorageConfig
 * @property {string|undefined} type - specifies where to store the liveConnect identifier. Allowed values: "cookie" or "html5" (local storage)
 * @property {string|undefined} name - specifies the name of the liveConnect identifier
 * @property {number|undefined} expires - number of days to store the liveConnect identifier
 */

/**
 * @typedef {Object} NotValidatedLiveConnectConfig
 * @property {(string[]|undefined)} scrapedIdentifiers - cookie names or local storage item names to be sent along with the tracking request
 * @property {(string|undefined)} providedFirstPartyIdentifier - the cookie name or the local storage item name of the provided first party identifier
 * @property {NotValidatedLiveConnectStorageConfig} storage - specifies way to store the liveConnect identifier
 */

import {hook} from '../src/hook';
import {config} from '../src/config';
import * as utils from '../src/utils';
import {gdprDataHandler} from '../src/adapterManager';
import $$PREBID_GLOBAL$$ from '../src/prebid';
import {hasGDPRConsent} from './userId/gdprUtils';
import {detectPrng, factory} from 'ulid/dist/index';

const prng = detectPrng(true);
/** Generator of ULID identifiers. Falls back to insecure `Math.random` identifiers when `window.crypto` is not present in browser. */
const ulid = factory(prng);

const COOKIE = 'cookie';
const LOCAL_STORAGE = 'html5';
const LIVE_PIXEL_URL = '//rp.liadm.com/p';
const DUID_NAME = '_lc2_duid';

/** @type {LiveConnectConfig} */
const CONFIG = {
  SCRAPED_IDENTIFIERS: 'scrapedIdentifiers',
  PROVIDED_FIRST_PARTY_IDENTIFIER: 'providedFirstPartyIdentifier',
  STORAGE: {
    TYPE: {
      KEY: 'type',
      ALLOWED: [COOKIE, LOCAL_STORAGE],
      DEFAULT: COOKIE
    },
    EXPIRES: {
      KEY: 'expires',
      DEFAULT: 730
    }
  }
};

// init the liveConnect hook to happen before the `requestBids` hook
init();

/**
 * Adds the liveConnect hook to happen before the `requestBids` hook and after the `consentManagement` hook
 */
export function init() {
  // priority value 40 will load after consentManagement with a priority of 50
  $$PREBID_GLOBAL$$.requestBids.before(liveConnectHook, 40);
}

/**
 * The global function to trigger the liveConnect pixel call.
 */
$$PREBID_GLOBAL$$.liveConnect = function () {
  $$PREBID_GLOBAL$$.liveConnectHook({});
};

/**
 * The liveConnect hook that triggers a pixel call. Happens either after `$$PREBID_GLOBAL$$.liveConnect` or `$$PREBID_GLOBAL$$.requestBids`
 */
$$PREBID_GLOBAL$$.liveConnectHook = hook('async', function () {
  liveConnectHook();
}, 'liveConnect');

/**
 * The flag that is used to ensure that pixel is called only once per script load.
 * @type {boolean}
 */
let isPixelFired = false;

/**
 * Resets the flag to enable multiple calls to liveConnect pixel. This function is used in tests.
 */
export function resetPixel() {
  isPixelFired = false;
}

/**
 * This function sends the liveConnect pixel call.
 * It does not send the pixel call if the pixel has already been triggered or the gdpr consent has not been given.
 */
function liveConnectHook() {
  if (!isPixelFired) {
    if (hasGDPRConsent(gdprDataHandler.getConsentData())) {
      sendLiveConnectPixel();
    }
    isPixelFired = true;
  }
}

/**
 * This function sends the liveConnect pixel call.
 */
function sendLiveConnectPixel() {
  const validConfig = validateConfig(config.getConfig('liveConnect'));
  const pageUrl = encodeURIComponent(getPageUrl());
  const duid = getDuid(validConfig);
  let pixelUri = `${LIVE_PIXEL_URL}?duid=${duid}&tna=$prebid.version$&pu=${pageUrl}`;

  const providedFpiQueryParams = getProvidedFpiQueryParams(validConfig);
  if (providedFpiQueryParams) {
    pixelUri += `&${providedFpiQueryParams}`;
  }

  const scrapedIdentifiers = getScrapedIdentifiers(validConfig);
  if (scrapedIdentifiers) {
    pixelUri += `&${scrapedIdentifiers}`;
  }

  utils.triggerPixel(pixelUri);
}

/**
 * Validates the liveConnect config. Sets the config values to be default values when they are not provided or invalid.
 * @param {NotValidatedLiveConnectConfig} config
 * @returns {LiveConnectConfig}
 */
function validateConfig(config) {
  const validConfig = {
    storage: {}
  };
  validConfig.storage[CONFIG.STORAGE.TYPE.KEY] = CONFIG.STORAGE.TYPE.DEFAULT;
  validConfig.storage[CONFIG.STORAGE.EXPIRES.KEY] = CONFIG.STORAGE.EXPIRES.DEFAULT;

  if (!config) return validConfig;

  validConfig[CONFIG.SCRAPED_IDENTIFIERS] = validOrDefault(config[CONFIG.SCRAPED_IDENTIFIERS], isArrayOfStrings, []);
  validConfig[CONFIG.PROVIDED_FIRST_PARTY_IDENTIFIER] = validOrDefault(config[CONFIG.PROVIDED_FIRST_PARTY_IDENTIFIER], utils.isStr, null);

  if (utils.isPlainObject(config.storage)) {
    validConfig.storage[CONFIG.STORAGE.TYPE.KEY] = validOrDefault(
      config.storage[CONFIG.STORAGE.TYPE.KEY],
      v => utils.isStr(v) && CONFIG.STORAGE.TYPE.ALLOWED.includes(v),
      CONFIG.STORAGE.TYPE.DEFAULT
    );
    validConfig.storage[CONFIG.STORAGE.EXPIRES.KEY] = validOrDefault(config.storage[CONFIG.STORAGE.EXPIRES.KEY], utils.isNumber, CONFIG.STORAGE.EXPIRES.DEFAULT);
  }
  return validConfig;
}

/**
 * Validates the given value against the function.
 * If the value is valid - the function returns this value.
 * If the value is invalid - the function returns the default value.
 * @param {*} val value to check
 * @param {function} check function that validates the value
 * @param {*} defaultVal the default value
 * @returns {*} or the default value
 */
function validOrDefault(val, check, defaultVal) {
  return check(val) ? val : defaultVal;
}

/**
 * Checks if the argument is an array of strings.
 * @param val value to be validated
 * @returns {Boolean} true - if the value is an array of string. Else - otherwise
 */
function isArrayOfStrings(val) {
  return (utils.isArray(val)) && (val.every(v => utils.isStr(v)));
}

/**
 * The url of the current page
 * @returns {string} The current page url or the referrer if the js is executed inside an iFrame
 */
function getPageUrl() {
  return utils.inIframe() ? document.referrer : window.location.href;
}

/**
 * Get the stored duid (liveConnect id) value from cookie or local storage.
 * Stores the new duid if it has not been stored. Updates the expiration if the duid has been set.
 * @param {LiveConnectConfig} validConfig
 * @returns {string} duid
 */
function getDuid(validConfig) {
  let duid = getStoredDuid(validConfig.storage);
  if (!duid) {
    duid = ulid();
  }
  storeDuid(validConfig.storage, duid);
  return duid;
}

/**
 * Get the stored duid (liveConnect id) value from cookie or local storage.
 * @param {LiveConnectStorageConfig} storage
 * @returns {string} duid
 */
function getStoredDuid(storage) {
  let storedValue;
  try {
    if (storage[CONFIG.STORAGE.TYPE.KEY] === COOKIE) {
      storedValue = utils.getCookie(DUID_NAME);
    } else if (storage[CONFIG.STORAGE.TYPE.KEY] === LOCAL_STORAGE) {
      storedValue = getFromLocalStorage(DUID_NAME);
    }
  } catch (e) {
    utils.logError(e);
  }
  return storedValue;
}

/**
 * Get a value from local storage by name if it is not expired
 * @param {string} name local storage item name
 * @returns {string}
 */
function getFromLocalStorage(name) {
  const storedValueExp = localStorage.getItem(`${name}_exp`);
  let storedValue;
  // empty string means no expiration set
  if (storedValueExp === '') {
    storedValue = localStorage.getItem(name);
  } else if (storedValueExp) {
    if ((new Date(storedValueExp)).getTime() - Date.now() > 0) {
      storedValue = decodeURIComponent(localStorage.getItem(name));
    }
  }
  return storedValue;
}

/**
 * Stores the duid into cookie or local storage
 * @param {LiveConnectStorageConfig} storage
 * @param {string} value duid value
 */
function storeDuid(storage, value) {
  try {
    const expiresStr = expiresString(storage[CONFIG.STORAGE.EXPIRES.KEY]);
    if (storage[CONFIG.STORAGE.TYPE.KEY] === COOKIE) {
      storeCookieOnEtldPlus1(DUID_NAME, value, expiresStr);
    } else if (storage[CONFIG.STORAGE.TYPE.KEY] === LOCAL_STORAGE) {
      localStorage.setItem(`${DUID_NAME}_exp`, expiresStr);
      localStorage.setItem(DUID_NAME, encodeURIComponent(value));
    }
  } catch (error) {
    utils.logError(error);
  }
}

/**
 * UTC formatted string of the expiration date
 * @param {number} expirationDays ttl of the cookie/local storage item
 * @returns {string} formatted date
 */
function expiresString(expirationDays) {
  let expiration = new Date();
  expiration.setDate(expiration.getDate() + expirationDays);
  return expiration.toUTCString();
}

/**
 * Stores the cookie on the apex domain.
 * @param {string} name cookie name
 * @param {string} value cookie value
 * @param {string} expiresStr UTC formatted expiration date string
 */
function storeCookieOnEtldPlus1(name, value, expiresStr) {
  const hostParts = window.location.hostname.split('.');
  if (!utils.cookiesAreEnabled()) {
    return;
  }
  for (let i = hostParts.length - 1; i >= 0; i--) {
    let domain = '.' + hostParts.slice(i).join('.');
    utils.setCookie(name, value, expiresStr, 'Lax', domain);
    const storedCookie = utils.getCookie(name);
    if (storedCookie === value) {
      return;
    }
  }
}

/**
 * Gets pixel query params that contains first party identifiers.
 * @param {LiveConnectConfig} validConfig
 * @returns {string|undefined} concatenated query params
 */
function getProvidedFpiQueryParams(validConfig) {
  let fpi;
  if (validConfig[CONFIG.PROVIDED_FIRST_PARTY_IDENTIFIER]) {
    const providedFirstPartyIdentifier = getFromCookieOrLocalStorage(validConfig[CONFIG.PROVIDED_FIRST_PARTY_IDENTIFIER]);
    if (providedFirstPartyIdentifier) {
      fpi = `pfpi=${providedFirstPartyIdentifier}&fpn=${validConfig[CONFIG.PROVIDED_FIRST_PARTY_IDENTIFIER]}`;
    }
  }
  return fpi;
}

/**
 * Reads an identifier from cookie or local storage
 * @param {string} identifierName name of the identifier
 * @returns {string | null} identifier value
 */
function getFromCookieOrLocalStorage(identifierName) {
  let identifierValue = utils.getCookie(identifierName);
  if (!identifierValue) {
    identifierValue = localStorage.getItem(identifierName);
  }
  return identifierValue;
}

/**
 * Gets pixel query params that contains scraped identifiers.
 * @param {LiveConnectConfig} validConfig
 * @returns {string|null} concatenated query params
 */
function getScrapedIdentifiers(validConfig) {
  let identifiers;
  if (validConfig[CONFIG.SCRAPED_IDENTIFIERS]) {
    identifiers = validConfig[CONFIG.SCRAPED_IDENTIFIERS]
      .map(identifierName => {
        let identifierValue = getFromCookieOrLocalStorage(identifierName);
        return identifierValue ? `ext_${identifierName}=${identifierValue}` : '';
      })
      .filter(param => param && param.length > 0)
      .join('&');
  }

  return identifiers && identifiers.length > 0 ? identifiers : null;
}
