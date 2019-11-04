# Overview

**Module Name**: LiveConnect  
**Module Type**: Tracker  
**Maintainer**: dev-berlin@liveintent.com

# Description

Send a tracking pixel request to LiveConnect pixel service.

# Usage
To trigger the pixel, call `pbjs.liveConnect()`. 
Make sure that `pbjs.setConfig` is done before the pixel call.
```javascript
pbjs.que.push(function () {
    pbjs.setConfig({});
    pbjs.liveConnect();
});
```
Alternatively, the pixel is also triggered upon `pbjs.requestBids`
```javascript
pbjs.que.push(function () {
    pbjs.setConfig({});
    pbjs.requestBids({});
});
```

# Example configuration
Example showing configuration for scraped identifiers and provided identifier. 
LiveConnect identifier has a changed name and expiration.  
```javascript
pbjs.setConfig({
    liveConnect: {
        providedFirstPartyIdentifier: "JSESSIONID",
        scrapedIdentifiers: ["pubcid", "_parrable_eid"],
        storage: {
            type: "cookie",
            name: "my_liveConnect_cookie",
            expires: 60
        }
    }
});
```
Example showing configuration to store identifiers in local storage.
```javascript
pbjs.setConfig({
    liveConnect: {
        storage: {
            type: "html5",
            name: "my_liveConnect_name",
            expires: 60
        }
    }
});
```
