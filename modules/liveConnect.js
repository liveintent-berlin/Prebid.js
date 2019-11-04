import {hook} from '../src/hook';
import {config} from '../src/config';
import * as utils from '../src/utils';
import {gdprDataHandler} from '../src/adapterManager';
import $$PREBID_GLOBAL$$ from '../src/prebid';
import {hasGDPRConsent} from './userId/gdprUtils';
import {detectPrng, factory} from 'ulid/dist/index';

const prng = detectPrng(true);
const ulid = factory(prng);

const COOKIE = 'cookie';
const LOCAL_STORAGE = 'html5';

const LIVE_PIXEL_URL = '//rp.liadm.com/p';
const CONFIG = {
  SCRAPED_IDENTIFIERS: 'scrapedIdentifiers',
  PROVIDED_FIRST_PARTY_IDENTIFIER: 'providedFirstPartyIdentifier',
  STORAGE: {
    TYPE: {
      KEY: 'type',
      ALLOWED: [COOKIE, LOCAL_STORAGE],
      DEFAULT: COOKIE
    },
    NAME: {
      KEY: 'name',
      DEFAULT: '_li_duid'
    },
    EXPIRES: {
      KEY: 'expires',
      DEFAULT: 30
    }
  }
};

init();

export function init() {
  // priority value 40 will load after consentManagement with a priority of 50
  $$PREBID_GLOBAL$$.requestBids.before(liveConnectHook, 40);
}

$$PREBID_GLOBAL$$.liveConnect = function () {
  $$PREBID_GLOBAL$$.liveConnectHook({});
};

$$PREBID_GLOBAL$$.liveConnectHook = hook('async', function () {
  liveConnectHook();
}, 'liveConnect');

let isPixelFired = false;

export function resetPixel() {
  isPixelFired = false;
}

function liveConnectHook() {
  if (!isPixelFired) {
    if (hasGDPRConsent(gdprDataHandler.getConsentData())) {
      sendLiveConnectPixel();
    }
    isPixelFired = true;
  }
}

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

function validateConfig(config) {
  const validConfig = {
    storage: {}
  };
  validConfig.storage[CONFIG.STORAGE.TYPE.KEY] = CONFIG.STORAGE.TYPE.DEFAULT;
  validConfig.storage[CONFIG.STORAGE.NAME.KEY] = CONFIG.STORAGE.NAME.DEFAULT;
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
    validConfig.storage[CONFIG.STORAGE.NAME.KEY] = validOrDefault(config.storage[CONFIG.STORAGE.NAME.KEY], utils.isStr, CONFIG.STORAGE.NAME.DEFAULT);
    validConfig.storage[CONFIG.STORAGE.EXPIRES.KEY] = validOrDefault(config.storage[CONFIG.STORAGE.EXPIRES.KEY], utils.isNumber, CONFIG.STORAGE.EXPIRES.DEFAULT);
  }
  return validConfig;
}

function validOrDefault(val, check, defaultVal) {
  return check(val) ? val : defaultVal;
}

function isArrayOfStrings(val) {
  return (utils.isArray(val)) && (val.every(v => utils.isStr(v)));
}

function getPageUrl() {
  return utils.inIframe() ? document.referrer : window.location.href;
}

function getDuid(validConfig) {
  let duid = getStoredDuid(validConfig.storage);
  if (!duid) {
    duid = ulid();
  }
  storeDuid(validConfig.storage, duid);
  return duid;
}

function getStoredDuid(storage) {
  let storedValue;
  try {
    if (storage[CONFIG.STORAGE.TYPE.KEY] === COOKIE) {
      storedValue = utils.getCookie(storage[CONFIG.STORAGE.NAME.KEY]);
    } else if (storage[CONFIG.STORAGE.TYPE.KEY] === LOCAL_STORAGE) {
      storedValue = getFromLocalStorage(storage[CONFIG.STORAGE.NAME.KEY]);
    }
  } catch (e) {
    utils.logError(e);
  }
  return storedValue;
}

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

function storeDuid(storage, value) {
  try {
    const expiresStr = expiresString(storage[CONFIG.STORAGE.EXPIRES.KEY]);
    if (storage[CONFIG.STORAGE.TYPE.KEY] === COOKIE) {
      storeCookieOnEtldPlus1(storage[CONFIG.STORAGE.NAME.KEY], value, expiresStr);
    } else if (storage[CONFIG.STORAGE.TYPE.KEY] === LOCAL_STORAGE) {
      localStorage.setItem(`${storage[CONFIG.STORAGE.NAME.KEY]}_exp`, expiresStr);
      localStorage.setItem(storage[CONFIG.STORAGE.NAME.KEY], encodeURIComponent(value));
    }
  } catch (error) {
    utils.logError(error);
  }
}

function expiresString(expirationDays) {
  let expiration = new Date();
  expiration.setDate(expiration.getDate() + expirationDays);
  return expiration.toUTCString();
}

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

function getFromCookieOrLocalStorage(identifierName) {
  let identifierValue = utils.getCookie(identifierName);
  if (!identifierValue) {
    identifierValue = localStorage.getItem(identifierName);
  }
  return identifierValue;
}

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
