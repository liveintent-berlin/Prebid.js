/**
 * This module adds LiveIntentId to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/liveIntentIdSystem
 * @requires module:modules/userId
 */
/** @type {Submodule} */
import * as utils from '../../src/utils'
import {ajax} from '../../src/ajax';

const MODULE_NAME = 'liveIntentId'
const LIVE_CONNECT_DUID_KEY = '_li_duid';
const DOMAIN_USER_ID_QUERY_PARAM_KEY = 'duid';
const DEFAULT_LIVEINTENT_IDENTITY_URL = '//id.liadm.com';
const DEFAULT_PREBID_SOURCE = 'prebid';

export const liveIntentIdSubmodule = {
  /**
   * used to link submodule with config
   * @type {string}
   */
  name: MODULE_NAME,

  /**
   * decode the stored id value for passing to bid requests
   * @function
   * @param {{unifiedId:string}} value
   * @returns {{liuid:Object}}
   */
  decode(value) {
    return (value && typeof value['unifiedId'] === 'string') ? { 'liuid': value['unifiedId'] } : undefined;
  },

  /**
   * performs action to obtain id and return a value in the callback's response argument
   * @function
   * @param {SubmoduleParams} [configParams]
   * @returns {function(callback:function)}
   */
  getId(configParams) {
    const publisherId = configParams && configParams.publisherId;
    if (!publisherId && typeof publisherId !== 'string') {
      utils.logError(`${MODULE_NAME} - publisherId must be defined, not a '${publisherId}'`);
      return;
    }
    let baseUrl = DEFAULT_LIVEINTENT_IDENTITY_URL;
    if (configParams.url) {
      baseUrl = configParams.url
    }

    const additionalIdentifierNames = configParams.identifiersToResolve || [];

    const additionalIdentifiers = additionalIdentifierNames.concat([LIVE_CONNECT_DUID_KEY]).reduce((obj, identifier) => {
      const value = utils.getCookie(identifier) || utils.getDataFromLocalStorage(identifier);
      const key = identifier.replace(LIVE_CONNECT_DUID_KEY, DOMAIN_USER_ID_QUERY_PARAM_KEY);
      if (value) {
        if (typeof value === 'object') {
          obj[key] = JSON.stringify(value);
        } else {
          obj[key] = value;
        }
      }
      return obj
    }, {});

    const queryString = utils.parseQueryStringParameters(additionalIdentifiers)
    const url = `${baseUrl}/idex/${DEFAULT_PREBID_SOURCE}/${publisherId}?${queryString}`;

    return function (callback) {
      ajax(url, response => {
        let responseObj;
        if (response) {
          try {
            responseObj = JSON.parse(response);
          } catch (error) {
            utils.logError(error);
          }
        }
        callback(responseObj);
      }, undefined, { method: 'GET', withCredentials: true });
    }
  }
};
