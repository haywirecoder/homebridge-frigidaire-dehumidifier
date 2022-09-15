[![NPM Version](https://img.shields.io/npm/v/homebridge-frigidaire-dehumidifier.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-frigidaire-dehumidifier)


<p align="center">
 
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">


</p>


# Homebridge Plug-In for Frigidaire Dehumidifier
An Homebridge plug-in to integrate the Frigidaire's connected dehumidifier with HomeKit. It monitors and control devices via the Frigidaire unofficial cloud API. Thanks to the Frigidaire Python API  https://github.com/bm1549/frigidaire developer, this module uses the logic gain from reviewing those libraries/code.

## Limitation:
* This module works with Frigidaire connected Dehumidifier. While the code can be upgraded to support other Frigidaire appliances, I don't own those appliances so I do not have method to develop or validating functionality. 
* This module will poll for the status of the various components based frequency provided in the configuration file. No realtime notification is provided.

## Know Issues:
* Water level hasn't been implement its on TODO

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
