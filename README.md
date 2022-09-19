[![NPM Version](https://img.shields.io/npm/v/homebridge-frigidaire-dehumidifier.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-frigidaire-dehumidifier)


<p align="center">
 
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge Plug-In for Frigidaire Dehumidifier
An Homebridge plug-in to integrate the Frigidaire's connected dehumidifier with HomeKit. It monitors and control devices via the Frigidaire unofficial cloud API. Thanks to the Frigidaire Python API  https://github.com/bm1549/frigidaire developer, this module uses the logic gain from reviewing those libraries/code.

## Limitation:
* This module will poll for the status of the various components based frequency provided in the configuration file. No realtime notification is provided.


## Configuration options

| Attributes        | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| username              | Frigidaire username. This is a required value.                    |
| password              | Frigidaire password. This is a required value.                                                                 |
| deviceRefresh        | Polling interval to obtain status of Frigidaire appliance, provided in seconds. Default to <i>90</i> seconds, this is an optional value. <b>Please note:</b> Small values may cause account lock or frequent API errors.                                                                    |
| dehumidifierMode          | Homekit only has two mode dehumidifying modes "Auto" and "Dehumidifying". When "Dehumidifying" is selected in Homekit the selection is map to a specific Frigidaire appliance mode: "Quiet", "Dry" or Continuous". <p><p>Valid numeric values are the following: <br>5 = "Dry"<br>8 = "Continuous" <br> 9 = "Quiet". <p>The default mode for is <i>5</i> which is Frigidaire "Dry" mode. This an optional value.  
| enableAirPurifier | Create additional tile for Air purifier/Ionizer functionality. Default to <i>true</i>, this is an optional value.                     
| sessionKeyRefresh        | Refresh interval to obtain new a Frigidaire appliance key. The value is provided in hours and default to <i>9</i> hours, this is an optional value. <b>Please note:</b> Session key are valid for 12 hours, the plug-in does check if a valid session key is present before each operation and automatically tries to re-login, but this does generate an error in the log for an invalid session key. This value is for proactive session key refresh to prevent error from appearing in logs due to expiring key. Setting this value to <i>0</i> will disable session key refresh.                                     
| excludedDevices         | Devices to suppress from HomeKit. This is an optional value. | |

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
      "dehumidifierMode": 9,
      "enableAirPurifier": true,
      "platform": "FrigidaireAppliance"
}
...]
