import * as liveConnect from 'modules/liveConnect';
import {config} from 'src/config';
import * as utils from 'src/utils';
import {resetConsentData} from 'modules/consentManagement';

const expect = require('chai').expect;

const PROVIDED_FPI_NAME = 'testPfpi';
const PROVIDED_FPI_VALUE = 'testPfpiValue';
const SCRAPED_IDENTIFIER_NAME = 'testIdentifier';
const SCRAPED_IDENTIFIER_VALUE = 'testIdentifierValue';
const EXPIRED_COOKIE_DATE = 'Thu, 01 Jan 1970 00:00:01 GMT';
const BASIC_PIXEL_CALL = '//rp\\.liadm\\.com/p\\?duid=[0-9A-Z]{26}&tna=$prebid.version$&pu=http%3A%2F%2Flocalhost%3A[0-9]{4}%2F%3Fid%3D[0-9]+';

function liveConnectConfig(config) {
  return {
    liveConnect: config
  }
}

describe('LiveConnect', () => {
  beforeEach(function () {
    liveConnect.init();
    sinon.stub(utils, 'triggerPixel');
    sinon.spy(utils, 'setCookie');
    sinon.spy(localStorage, 'setItem');
  });

  afterEach(function () {
    $$PREBID_GLOBAL$$.requestBids.removeAll();
    config.resetConfig();
    utils.setCookie(PROVIDED_FPI_NAME, '', EXPIRED_COOKIE_DATE);
    utils.setCookie(SCRAPED_IDENTIFIER_NAME, '', EXPIRED_COOKIE_DATE);
    localStorage.removeItem(PROVIDED_FPI_NAME);
    localStorage.removeItem(SCRAPED_IDENTIFIER_NAME);
    liveConnect.resetPixel();
    utils.triggerPixel.restore();
    utils.setCookie.restore();
    localStorage.setItem.restore();
    resetConsentData();
  });

  describe('identifier', () => {
    it('should be set to cookie', () => {
      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.setCookie.callCount).to.equal(1);
      expect(utils.setCookie.getCall(0).args[0]).to.exist.and.to.equal('_li_duid');
    });

    it('should be set to cookie when storage type is unknown', () => {
      config.setConfig(liveConnectConfig({storage: {type: 'html7'}}));

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.setCookie.callCount).to.equal(1);
      expect(utils.setCookie.getCall(0).args[0]).to.exist.and.to.equal('_li_duid');
    });

    it('should be set to cookie with custom name', () => {
      config.setConfig(liveConnectConfig({storage: {name: 'custom_name'}}));

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.setCookie.callCount).to.equal(1);
      expect(utils.setCookie.getCall(0).args[0]).to.exist.and.to.equal('custom_name');
    });

    it('should be set to local storage identifier', () => {
      config.setConfig(liveConnectConfig({storage: {type: 'html5'}}));

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.setCookie.callCount).to.equal(0);
      expect(localStorage.setItem.callCount).to.equal(2);
      expect(localStorage.setItem.getCall(0).args[0]).to.exist.and.to.equal('_li_duid_exp');
      expect(localStorage.setItem.getCall(1).args[0]).to.exist.and.to.equal('_li_duid');
    });

    it('should be set to local storage identifier with custom name', () => {
      config.setConfig(liveConnectConfig({storage: {type: 'html5', name: 'custom_name', expires: 23}}));

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.setCookie.callCount).to.equal(0);
      expect(localStorage.setItem.callCount).to.equal(2);
      expect(localStorage.setItem.getCall(0).args[0]).to.exist.and.to.equal('custom_name_exp');
      expect(localStorage.setItem.getCall(1).args[0]).to.exist.and.to.equal('custom_name');
    });

    it('should be set only once', () => {
      $$PREBID_GLOBAL$$.liveConnect();
      $$PREBID_GLOBAL$$.requestBids({});

      expect(utils.setCookie.callCount).to.equal(1);
    });

    it('should not be set when consent is not given', () => {
      config.setConfig({
        consentManagement: {
          cmpApi: 'static',
          timeout: 7500,
          allowAuctionWithoutConsent: false,
          consentData: {
            getConsentData: {
              'gdprApplies': true,
              'consentData': 'BOOgjO9OOgjO9APABAENAi-AAAAWd7_______9____7_9uz_Gv_r_ff_3nW0739P1A_r_Oz_rm_-zzV44_lpQQRCEA'
            },
            getVendorConsents: {
              'purposeConsents': {
                '1': false
              }
            }
          }
        }
      });

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.setCookie.callCount).to.equal(0);
      expect(localStorage.setItem.callCount).to.equal(0);
    });
  });

  describe('pixel call', () => {
    it('should be sent to pixel endpoint', () => {
      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.triggerPixel.callCount).to.equal(1);
      expect(utils.triggerPixel.getCall(0).args[0]).to.exist.and.to.match(new RegExp(BASIC_PIXEL_CALL));
    });

    it('should be sent to pixel endpoint when bid is performed', () => {
      $$PREBID_GLOBAL$$.requestBids({});

      expect(utils.triggerPixel.callCount).to.equal(1);
      expect(utils.triggerPixel.getCall(0).args[0]).to.exist.and.to.match(new RegExp(BASIC_PIXEL_CALL));
    });

    it('should be sent to pixel endpoint only once', () => {
      $$PREBID_GLOBAL$$.liveConnect();
      $$PREBID_GLOBAL$$.requestBids({});

      expect(utils.setCookie.callCount).to.equal(1);
    });

    it('should be sent to pixel endpoint when the provided fpi is set into cookie', () => {
      utils.setCookie(PROVIDED_FPI_NAME, PROVIDED_FPI_VALUE, (new Date(Date.now() + 60000).toUTCString()));
      config.setConfig(liveConnectConfig({providedFirstPartyIdentifier: PROVIDED_FPI_NAME}));

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.triggerPixel.callCount).to.equal(1);
      expect(utils.triggerPixel.getCall(0).args[0]).to.exist.and.to.match(new RegExp(
        BASIC_PIXEL_CALL + `&pfpi=${PROVIDED_FPI_VALUE}&fpn=${PROVIDED_FPI_NAME}`
      ));
    });

    it('should be sent to pixel endpoint when the provided fpi is set into local storage', () => {
      localStorage.setItem(PROVIDED_FPI_NAME, PROVIDED_FPI_VALUE);
      config.setConfig(liveConnectConfig({providedFirstPartyIdentifier: PROVIDED_FPI_NAME}));

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.triggerPixel.callCount).to.equal(1);
      expect(utils.triggerPixel.getCall(0).args[0]).to.exist.and.to.match(new RegExp(
        BASIC_PIXEL_CALL + `&pfpi=${PROVIDED_FPI_VALUE}&fpn=${PROVIDED_FPI_NAME}`
      ));
    });

    it('should be sent to pixel endpoint when the scraped identifier is set into cookie', () => {
      utils.setCookie(SCRAPED_IDENTIFIER_NAME, SCRAPED_IDENTIFIER_VALUE, (new Date(Date.now() + 60000).toUTCString()));
      config.setConfig(liveConnectConfig({scrapedIdentifiers: [SCRAPED_IDENTIFIER_NAME]}));

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.triggerPixel.callCount).to.equal(1);
      expect(utils.triggerPixel.getCall(0).args[0]).to.exist.and.to.match(new RegExp(
        BASIC_PIXEL_CALL + `&ext_${SCRAPED_IDENTIFIER_NAME}=${SCRAPED_IDENTIFIER_VALUE}`
      ));
    });

    it('should be sent to pixel endpoint when the scraped identifier is set into local storage', () => {
      localStorage.setItem(SCRAPED_IDENTIFIER_NAME, SCRAPED_IDENTIFIER_VALUE);
      config.setConfig(liveConnectConfig({scrapedIdentifiers: [SCRAPED_IDENTIFIER_NAME]}));

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.triggerPixel.callCount).to.equal(1);
      expect(utils.triggerPixel.getCall(0).args[0]).to.exist.and.to.match(new RegExp(
        BASIC_PIXEL_CALL + `&ext_${SCRAPED_IDENTIFIER_NAME}=${SCRAPED_IDENTIFIER_VALUE}`
      ));
    });

    it('should be sent to pixel endpoint when the scraped identifier and provided fpi are set', () => {
      localStorage.setItem(SCRAPED_IDENTIFIER_NAME, SCRAPED_IDENTIFIER_VALUE);
      localStorage.setItem(PROVIDED_FPI_NAME, PROVIDED_FPI_VALUE);
      config.setConfig(liveConnectConfig({providedFirstPartyIdentifier: PROVIDED_FPI_NAME, scrapedIdentifiers: [SCRAPED_IDENTIFIER_NAME]}));

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.triggerPixel.callCount).to.equal(1);
      expect(utils.triggerPixel.getCall(0).args[0]).to.exist.and.to.match(new RegExp(
        BASIC_PIXEL_CALL + `&pfpi=${PROVIDED_FPI_VALUE}&fpn=${PROVIDED_FPI_NAME}&ext_${SCRAPED_IDENTIFIER_NAME}=${SCRAPED_IDENTIFIER_VALUE}`
      ));
    });

    it('should not be sent to pixel endpoint when consent is not given', () => {
      config.setConfig({
        consentManagement: {
          cmpApi: 'static',
          timeout: 7500,
          allowAuctionWithoutConsent: false,
          consentData: {
            getConsentData: {
              'gdprApplies': true,
              'consentData': 'BOOgjO9OOgjO9APABAENAi-AAAAWd7_______9____7_9uz_Gv_r_ff_3nW0739P1A_r_Oz_rm_-zzV44_lpQQRCEA'
            },
            getVendorConsents: {
              'purposeConsents': {
                '1': false
              }
            }
          }
        }
      });

      $$PREBID_GLOBAL$$.liveConnect();

      expect(utils.triggerPixel.callCount).to.equal(0);
    });
  });
});
