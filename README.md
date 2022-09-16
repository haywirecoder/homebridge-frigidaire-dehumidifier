[![NPM Version](https://img.shields.io/npm/v/homebridge-frigidaire-dehumidifier.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-frigidaire-dehumidifier)


<p align="center">
 
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge Plug-In for Frigidaire Dehumidifier
An Homebridge plug-in to integrate the Frigidaire's connected dehumidifier with HomeKit. It monitors and control devices via the Frigidaire unofficial cloud API. Thanks to the Frigidaire Python API  https://github.com/bm1549/frigidaire developer, this module uses the logic gain from reviewing those libraries/code.

## Limitation:
* This module will poll for the status of the various components based frequency provided in the configuration file. No realtime notification is provided.

## Know Issues:
* Water level hasn't been implement it is on the TO-DO
* Occasionally the following error will appear on the log:  "ECP2004 Auth API error: Request failed with status code 401". This occurs when  sessionkey expires. The plug-in will auto re-login to obtain a new sessionkey. Once the time length of sessionkey is determine the plug will be upgraded with a proactive re-login to reduce the appearance of this error.


## Configuration options

| Attributes        | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| username              | Frigidaire username. This is a required value.                    |
| password              | Frigidaire password. This is a required value.                                                                 |
| deviceRefresh        | Polling interval to obtain status of Frigidaire appliance, provided in seconds. Default to <i>90</i> seconds, this is an optional value. <b>Please note:</b> Small values may cause account lock or frequent API errors.                                                                    |
| dehumidifierMode          | Homekit only has two mode dehumidifying modes <i>auto</i> and <i>dehumidifying</i>. When <i>dehumidifying</i> is selected the selection will be map to specific Frigidaire appliance mode such Quiet, Dry and continuous.
| enableAirFilter | Create additional tile for Air Filter/Ionizer functionality. Default to <i>true</i>, this is an optional value.                                               
| excludedDevices         | Devices to suppress from HomeKit. This is an optional value. | |




Example configuration is below.

```javascript
...

"platforms": [
{
    "name": "FrigidaireAppliance",
    "auth": {
        "username": "<username>",
        "password": "<password>"
      },
      "deviceRefresh": 90,
      "dehumidifierMode": 9,
      "enableAirFilter": true,
      "platform": "FrigidaireAppliance"
}
...]
