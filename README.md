[![NPM Version](https://img.shields.io/npm/v/homebridge-frigidaire-dehumidifier.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-frigidaire-dehumidifier)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)


<p align="center">
 
<img src="https://github.com/homebridge/branding/blob/latest/logos/homebridge-color-round-stylized.png" width="150">

</p>


# Homebridge Plug-In for Frigidaire Dehumidifier
An Homebridge plug-in to integrate the Frigidaire's connected dehumidifier with HomeKit. It monitors and control devices via the Frigidaire unofficial cloud API. Thanks to the Frigidaire Python API  https://github.com/bm1549/frigidaire developers and https://github.com/karlg100/frigidaire , this module uses logic and code gain from reviewing those works.
Frigidaire updated their API (to V3) in June 2023 and deprecated v2 in February 2024, meaning the plug-in engine had to be re-written. Upgrade to version 2+ may impact previous automation or setting. This is a one time event to support Frigidaire v3 API.



## Limitation:
* This module will poll for the status of the various components based frequency provided in the configuration file. No realtime notification is provided.


## Configuration options

| Attributes        | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| username              | Frigidaire username. This is a required value.                    |
| password              | Frigidaire password. This is a required value.                                                                 |
| deviceRefresh        | Polling interval to obtain status of Frigidaire appliance, provided in seconds. Default to <i>90</i> seconds, this is an optional value. <b>Please note:</b> Small values may cause account lock or frequent API errors.                                                                    |
| dehumidifierMode          | Homekit only has two mode dehumidifying modes "Auto" and "Dehumidifying". When "Dehumidifying" is selected in Homekit the selection is map to a specific Frigidaire appliance mode: "Quiet", "Dry" or "Continuous". <p><p>Valid string values are the following: <br>"Dry"<br>"Continuous"<br>"Quiet"<p>The default mode for is Frigidaire "Dry" mode. This an optional value.  
| enableAirPurifier | Create additional tile for Air purifier/Ionizer functionality. Default to <i>true</i>, this is an optional value.                                                         
| excludedDevices         | Devices IDs to suppress from HomeKit. The device IDs can be obtain from Homebridge logs at startup of this plug-in. This is an optional value. | |


## 💧 Note: Dehumidifier Relative Humidity

There is a difference between Frigidaire App and Homebridge/HomeKit for relative humidity. 

HomeKit Relative Humidity work between 0%-100% (By design). Here is translation between Frigidaire and Homekit.

| Frigidaire | HomeKit |
| --- | --- |
| 35% | 0% |
| 40% | 10% |
| 45% | 20% |
| 50% | 30% |
| 55% | 40% |
| 60% | 50% |
| 65% | 60% |
| 70% | 70% |
| 75% | 80% |
| 80% | 90% |
| 85% | 100% |


Example configuration is below, with Frigidaire dehumidifier mode set to <i>Quiet</i> mode for dehumidifying and Air purifier/Ionizer set to display in Homekit. 

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
      "dehumidifierMode": "Quiet",
      "enableAirPurifier": true,
      "platform": "FrigidaireAppliance"
}
...]


