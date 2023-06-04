
const EventEmitter = require('events');
const CryptoJS = require('crypto-js');
const superagent = require('superagent');
const uuid4 = require('uuid4');
const constants = require('./constants.json');


// URL constant for retrieving data

const APIURLV3 = 'https://api.us.ecp.electrolux.com'
const BRAND = 'Frigidaire'
const COUNTRY = 'US'

 // attributes
 const FIRMWARE_VERSION = '0011';
 const FILTER_STATUS= '1021';
 const CONNECTIVITY_STATE = '0000'
 const MODE = '1000';
 const FAN_MODE = '1002';
 const CURRENTSTATE = '0401'
 const HUMIDITY_ROOM = '04EB'
 const CHILD_MODE = '0463'
 const COOLINGSTATE = '04A1';
 const NETWORK_NAME = '0070'
 const CLEAN_AIR_MODE = '1004';
 const POWER_MODE = "0403";
 const BIN_FULL_STATUS= "04E5";
 const LINK_QUALITY_INDICATOR = "0032";
 const TARGET_HUMIDITY = '04EA';

 // Only HIGH and LOW apply to dehumidifiers
 const FANMODE_OFF = 0;
 const FANMODE_LOW = 1;
 const FANMODE_MED = 2;
 const FANMODE_HIGH = 4;
 const FANMODE_AUTO = 7;
 

 const CLEANAIR_ON = 1;
 const CLEANAIR_OFF = 0;

 const COOLINGSTATE_OFF = 0;
 const COOLINGSTATE_ON = 1;

 const FILTER_GOOD = 0;
 const FILTER_CHANGE = 2;

 // Air Conditioner Modes
 const MODE_OFF = 0;
 const MODE_COOL = 1;
 const MODE_FAN = 3;
 const MODE_ECON = 4;

 // Dehumidifier Modes
 const DEHMODE_DRY = 5;
 const DEHMODE_AUTO = 6;
 const DEHMODE_CONTINUOUS = 8;
 const DEHMODE_QUIET = 9;

 const FAHRENHEIT = 1;
 const CELSIUS = 0;

 const AIR_CONDITIONER = "AC1";
 const DEHUMIDIFIER = "DH1";

 const POWER_ON = 1
 const POWER_OFF = 0

 const CHILDMODE_OFF = 0
 const CHILDMODE_ON = 1

 const DEHUMIDIFIERMODES = new Set([DEHMODE_DRY,DEHMODE_AUTO,DEHMODE_CONTINUOUS,DEHMODE_QUIET]);
 const DEHUMIDIFIERFANMODES = new Set([FANMODE_MED,FANMODE_LOW,FANMODE_HIGH]);
 const FRIGIDAIRE_SESSIONKEY_TIMEOUT = 9 // Session valid for 12 hours. Default to refresh key at the 9th hour (75%).
 
 const decrypt = (data) => {
    return CryptoJS.enc.Base64.parse(data).toString(CryptoJS.enc.Utf8);
}

class Frigidaire extends EventEmitter {
    auth_token = {};
    excludedDevices = []
    log = {};
    deviceRefreshHandle;
    sessionKeyRefreshHandle;
    deviceRefreshTime;
    sessionKeyRefreshTime;
    cid;
    deviceId;
    country;
    brand;
    sessionKey;
    pollingInterval;
    attempts;
    frig_devices = [];
    lastUpdate;
    updateTimer = [];


    constructor(log, config) {
        super();
        this.log = log;
        this.excludedDevices = config.excludedDevices || [];
        this.auth_token.username = config.auth.username;
        this.auth_token.password = config.auth.password;
        this.cid = decrypt(constants.cid.data);
        this.deviceId = uuid4();
        this.country =config.country || COUNTRY;
        this.brand =BRAND;
        this.sessionKey = null;
        this.deviceRefreshTime = config.deviceRefresh * 1000 || 90000; // default to 90 secs, so we don't hammer their servers
        this.attempts = 0;
        this.lastUpdate = null;  
        this.isBusy = false;      
        this.sessionKeyRefreshTime = (config.sessionKeyRefresh ?? FRIGIDAIRE_SESSIONKEY_TIMEOUT) * 3600000;  

    };

    // Initialization routine
    async init() {
        
        // Authenticate user
        try {
            const authResponse = await this.authenticate();
            // if login successful, get devices/appliances
            if (authResponse) {
                this.log.info('Login Successful.'); 
                await this.discoverDevices();

                // Set time to refresh session key
                if(this.sessionKeyRefreshTime > 0) {
                    this.log.info(`Frigidaire Session Key will be refresh in ${Math.floor((this.sessionKeyRefreshTime / (1000 * 60 * 60)) % 24)} hour(s) and ${Math.floor((this.sessionKeyRefreshTime / (1000 * 60 )) % 60)} min(s).`);
                    this.sessionKeyRefreshHandle = setTimeout(() => this.refreshSessionKey(), this.sessionKeyRefreshTime);
                }
                else this.log.info(`Automatic Frigidaire Session Key refresh has been disabled.`);
            }
            else return false;

            // If we got to here all Initialization were complete and return successful start
            return true;

        }  catch (err) {
                this.log.error('Frigidaire Initialization Error: ',err);
                return false;

        }
    }

    // Authenticates with the Frigidaire API. This will be used re-authenticate if the session key is deemed invalid and will
    // throw an exception if the authentication request fails or returns an unexpected response.
    async authenticate() {

        var headers = {
            'x-ibm-client-id': this.cid,
            'User-Agent': 'Frigidaire/81 CFNetwork/1206 Darwin/20.1.0',
            'x-api-key': this.cid,
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + this.cid,
        }
        var authBody = {
            "username": this.auth_token.username,
            "password": this.auth_token.password,
            "brand": this.brand,
            "deviceId": this.deviceId,
            "country": this.country,
        }

        this.log.debug('Attempting to login...');
        var authUrl = APIURLV3 + '/authentication/authenticate';
        this.isBusy = true;
        try {
            const response = await superagent
                                .post(authUrl)
                                .send(authBody) // sends a JSON post body
                                .set(headers)
                                .set('accept', 'json')
                                .disableTLSCerts();
           
            if (response.body.status == 'ERROR' && response.body.code != 'ECP0000') {
                this.log.error("Frigidaire Login Error: " + response.body.code + " " + response.body.message);
            } 
            else {
                this.sessionKey = response.body.data.sessionKey;
                if (this.sessionKey != "") {
                    this.isBusy = false;
                    this.log.debug('Current Session Key set to: ', this.sessionKey);
                    return true;
                }
            }
          } 
          catch (err) {
                this.log.error("Frigidaire Login Error: ", err.response.body.code + ' ' + err.response.body.message);
                this.isBusy = false;
                return false;
         }
    }

    // Tests for successful connectivity to the Frigidaire server, to lightweight end point
    async isValidSession() {
        var uri = "/config-files/haclmap/latest_version";

        if ((this.sessionKey == null) || (this.sessionKey == "")) return false;
      
        var sessionValidationResponse = await this.getRequest(uri);
        if ((!sessionValidationResponse) || (sessionValidationResponse == "")) return false;
        return true;
    };

    // Discover devices in account and built out the the array
    async discoverDevices () {
        var uri = '/user-appliance-reg/users/' + this.auth_token.username + '/appliances?country=' + COUNTRY + '&includeFields=true';
      
        const deviceJSON = await this.getRequest(uri);
        // create device list from user profile.
        for(var i in deviceJSON) {
            // used for debugging -- Dump all devices discovered at start up
            this.log.debug(deviceJSON);

            if (this.excludedDevices.includes(deviceJSON[i]['appliance_id'])) {
                this.log(`Executing Device with name: '${deviceJSON[i]['nickname']}'`);
                
            } else {
                var device = {};
                device.deviceId = deviceJSON[i]['appliance_id'];
                device.serialNumber = deviceJSON[i]['sn'].trim();; //Serial number
                device.name = deviceJSON[i]['nickname'].trim();
                device.mac = deviceJSON[i]['mac']; // MAC address
                device.pnc = deviceJSON[i]['pnc']; // Product code
                device.elc = deviceJSON[i]['elc'];
                device.cpv = deviceJSON[i]['cpv'];
                device.destination = "";
                device.monitoredValues = "";
                device.lastUpdate = Date.now();
                this.frig_devices.push(device);
                await this.getDetailForDevice(i);
            }
        }
       
    }

    // For each device on list get the detail, if the device has change emit a change to allow accessory to capture the change. 
    async refreshDevices () {

        // Performing update don't allow other processes
        if (this.isBusy) return;
        this.isBusy = true;
        var currentUpdateDate;
        var deviceResp;
        for (var i = 0; i < this.frig_devices.length; i++) {
            currentUpdateDate = this.frig_devices[i].lastupdate;
            deviceResp = await this.getDetailForDevice(i);
            
            if (deviceResp){
                // change were detected update device data elements and trigger update.
                if (currentUpdateDate != this.frig_devices[i].lastupdate) {
                this.emit(this.frig_devices[i].deviceId, {
                    device: this.frig_devices[i]
                });}
            }
        }
        // Process completed remove blocker to other activies
        this.isBusy = false;
    }

    // Uses the Frigidaire API to fetch details for a given appliance
    async getDetailForDevice(deviceIndex) {
        const DETAILENDPOINT = '/elux-ms/appliances/latest'
        var urlDeviceString = "?pnc=" + this.frig_devices[deviceIndex].pnc + "&elc=" + this.frig_devices[deviceIndex].elc + "&sn=" + this.frig_devices[deviceIndex].serialNumber + "&mac=" + this.frig_devices[deviceIndex].mac + "&includeSubcomponents=true";
        var uri = DETAILENDPOINT + urlDeviceString;

        try {
            const detailJSON = await this.getRequest(uri);
              // used for debugging -- Dump all detail each time called such as update and discovery
            this.log.debug(detailJSON);

            // store just monitored data elements
            for (var i = 0; i < detailJSON.length; i++) { 
                switch (detailJSON[i]['haclCode']) {
                    case HUMIDITY_ROOM:
                        this.frig_devices[deviceIndex].roomHumidity = detailJSON[i]['numberValue'];
                    break;
                    case MODE:
                        this.frig_devices[deviceIndex].mode = detailJSON[i]['numberValue'];
                        this.frig_devices[deviceIndex].destination = detailJSON[i]['source'];
                        
                    break;
                    case FILTER_STATUS:
                        this.frig_devices[deviceIndex].filterStatus = detailJSON[i]['numberValue'];
                        
                    break;
                    case FAN_MODE:
                        this.frig_devices[deviceIndex].fanMode = detailJSON[i]['numberValue'];
                        
                    break;
                    case CLEAN_AIR_MODE:
                        this.frig_devices[deviceIndex].clearAirMode = detailJSON[i]['numberValue'];
                        
                    break;
                    case CHILD_MODE:
                        this.frig_devices[deviceIndex].childMode = detailJSON[i]['numberValue'];
                        
                    break;
                    case BIN_FULL_STATUS:
                        this.frig_devices[deviceIndex].bucketStatus = detailJSON[i]['numberValue'];
                        
                    break;
                    case TARGET_HUMIDITY:
                        this.frig_devices[deviceIndex].targetHumidity = detailJSON[i]['numberValue'];
                        
                    break;
                    case FIRMWARE_VERSION:
                        this.frig_devices[deviceIndex].firmwareVersion = detailJSON[i]['stringValue'];
                       
                    break;
                }
            }
        }
        catch (err) {

            this.log.error('Frigidaire device detail Error: ',err);
            return false;
        }
        // Determine if anything has changed since last get, if yes update lastupdate date.
        var hasMonitoredValuesChanged = "" + this.frig_devices[deviceIndex].roomHumidity 
                                 + this.frig_devices[deviceIndex].mode 
                                 + this.frig_devices[deviceIndex].filterStatus 
                                 + this.frig_devices[deviceIndex].fanMode 
                                 + this.frig_devices[deviceIndex].clearAirMode
                                 + this.frig_devices[deviceIndex].bucketStatus
                                 + this.frig_devices[deviceIndex].targetHumidity;
        
        if (hasMonitoredValuesChanged != this.frig_devices[deviceIndex].monitoredValues) {
            this.frig_devices[deviceIndex].monitoredValues = hasMonitoredValuesChanged;
            this.frig_devices[deviceIndex].lastupdate = Date.now();
        }

        return true;
    }   

    //  Makes a get request to the Frigidaire API and parses the result
    async getRequest(endpoint) {
        
        var url = APIURLV3 + endpoint;
        var headers = {
            'x-ibm-client-id': this.cid,
            'User-Agent': 'Frigidaire/81 CFNetwork/1206 Darwin/20.1.0',
            'x-api-key': this.cid,
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + this.cid,
        }
   
        headers['session_token'] = this.sessionKey;
        try {
            const response = await superagent
                                .get(url)
                                .set(headers)
                                .disableTLSCerts();
            if (response.body.status == 'ERROR' && response.body.code != 'ECP0000') {
                this.log.error("Frigidaire Get Error: " + response.body.code + " " + response.body.message + " EndPoint: " + endpoint);
             } 
            else { 
                this.log.debug('Get Request complete',response.body.message );
                return (response.body.data);
            }
          } 
          catch (err) {
            this.log.error('Frigidaire Get Error: ', err.response.body.code +' ' + err.response.body.message + " EndPoint: " + endpoint);
         }
    }

    async setDevicePowerMode(deviceIndex, onValue = false){
          // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
        var returnCode = 0;
        
        if (onValue) returnCode = await this.sendDeviceCommand(deviceIndex,POWER_MODE,POWER_ON) 
        else returnCode = await this.sendDeviceCommand(deviceIndex,POWER_MODE,POWER_OFF) 
        if (returnCode == 200)
        {
            this.frig_devices[deviceIndex].mode = onValue;
            return onValue;
        }
    
        return -1;
    }

    async setDehumidifierMode(deviceIndex, DehumMode = DEHMODE_AUTO){
        // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
        // Is a dehumidifier appliance?
        if(this.frig_devices[deviceIndex].destination != DEHUMIDIFIER) return false;
        // Is validated mode?
        if(!DEHUMIDIFIERMODES.has(DehumMode)) return false;
        var returnCode = 0; 
        
        returnCode = await this.sendDeviceCommand(deviceIndex,MODE,DehumMode);
        if (returnCode == 200)
        {
            this.frig_devices[deviceIndex].mode = DehumMode;
            return DehumMode;
        }
        
        return -1;
    }

    async setDehumidifierFanMode(deviceIndex,fanModeValue = FANMODE_LOW){
          // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
        // Is a dehumidifier appliance?
        if(this.frig_devices[deviceIndex].destination != DEHUMIDIFIER) return false;
         // Is validate mode?
         if(!DEHUMIDIFIERFANMODES.has(fanModeValue)) return false;
        var returnCode = 0;
        
        // check if applicance is in auto model? If auto fam mode is automatically and can't be adjusted.
        if (this.frig_devices[deviceIndex].mode == DEHMODE_AUTO) return false;
        returnCode = await this.sendDeviceCommand(deviceIndex,FAN_MODE, fanModeValue);
        if (returnCode == 200)
         {
            this.frig_devices[deviceIndex].fanMode = fanModeValue;
            return fanModeValue;
        }
        return -1;
    }
    
    async setDehumidifierRelativeHumidity(deviceIndex, humidityLevel = 50){
        // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
        // Is a dehumidifier appliance?
        if(this.frig_devices[deviceIndex].destination != DEHUMIDIFIER) return false;
        var returnCode = 0;
        // determine if the humidity level is within acceptable range.
        if (humidityLevel >= 35 && humidityLevel <= 85) {
            // round to nearest multiple of 5.
            humidityLevel = Math.ceil(humidityLevel/5)*5;
            // If mode is not in auto mode that change set humidity level. 
            // check if appliance is in auto model? If auto fam mode is automatically and can't be adjusted.
            if (this.frig_devices[deviceIndex].mode == DEHMODE_AUTO) return false;
            returnCode = await this.sendDeviceCommand(deviceIndex,TARGET_HUMIDITY, humidityLevel);
            if (returnCode == 200)
            {
                this.frig_devices[deviceIndex].targetHumidity = humidityLevel;
                return humidityLevel;
            }
        }
        this.log.error('Dehumidifier Humidity Level not within acceptable range. Value must be between 35 and 85.', err);
        return -1;
    }

    async setDehumidifierAirPurifier(deviceIndex,modeValue = CLEANAIR_OFF){
         // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
        // Is a dehumidifier appliance?
        if(this.frig_devices[deviceIndex].destination != DEHUMIDIFIER) return false;
        var returnCode = 0;

        // Send command to API endpoint base on user selection
        if (modeValue == CLEANAIR_ON) returnCode = await this.sendDeviceCommand(deviceIndex,CLEAN_AIR_MODE,CLEANAIR_ON);
        else returnCode = await this.sendDeviceCommand(deviceIndex,CLEAN_AIR_MODE,CLEANAIR_OFF);
        if (returnCode == 200)
        {
            this.frig_devices[deviceIndex].clearAirMode = modeValue;
            return modeValue;
        }
        
        return -1;
    }

    async setDehumidifierChildLock(deviceIndex, modeValue = CHILDMODE_OFF){
           // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
        // Is a dehumidifier appliance?
        if(this.frig_devices[deviceIndex].destination != DEHUMIDIFIER) return false;
        var returnCode = 0;
        // Send command to API endpoint base on user selection 
        if (modeValue == CHILDMODE_ON) returnCode = await this.sendDeviceCommand(deviceIndex,CHILD_MODE,CHILDMODE_ON); 
        else returnCode = await this.sendDeviceCommand(deviceIndex,CHILD_MODE,CHILDMODE_OFF); 
        if (returnCode == 200)
        {
            this.frig_devices[deviceIndex].childMode = modeValue;
            return modeValue;
        } 
       
        return -1;
    }

    // Executes any defined action on a given appliance. Will authenticate if the request fails
    async sendDeviceCommand(deviceIndex,attribute, value) {
       

        const POSTENDPOINT = APIURLV3 + "/commander/remote/sendjson";

        var urlDeviceString = "?pnc=" + this.frig_devices[deviceIndex].pnc + "&elc=" + this.frig_devices[deviceIndex].elc + "&sn=" + this.frig_devices[deviceIndex].serialNumber + "&mac=" + this.frig_devices[deviceIndex].mac;
        var uri = POSTENDPOINT + urlDeviceString
       
        var headers = {
            'x-ibm-client-id': this.cid,
            'User-Agent': 'Frigidaire/81 CFNetwork/1206 Darwin/20.1.0',
            'x-api-key': this.cid,
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + this.cid,
        }
        headers['session_token'] = this.sessionKey;

        var timestamp = Math.round(Date.now() / 1000)
        var components = [];
        var action = { "name": attribute, "value": value }
        components.push(action);
        
        var postBody = {
            "timestamp": timestamp,
            "source": "RP1",
            "components": components,
            "operationMode": "EXE",
            "destination": this.frig_devices[deviceIndex].destination,
            "version": "ad"
        }

        if (!(await this.isValidSession())) {

           this.log.warn('Send command detect login no longer valid. Attempting to re-login',);
           // session is expired or not login, get new session key
            const authResponse = await this.authenticate();
            if (!authResponse) return -1;
        }
        
        // Block other activities during updates
        this.isBusy = true;
        try {
            const response = await superagent
                                .post(uri)
                                .send(postBody)
                                .set(headers)
                                .disableTLSCerts();
            if (response.statusCode != 200) {
                this.log.error('Frigidaire post Error: ' + response.body.code + ' ' + response.body.message);
            }
            else
               {
                this.isBusy = false;
                this.log.debug('Post Command complete', response.body.message);
                return response.statusCode;
               }
        }
          catch (err) {
            this.log.error('Frigidaire post Error: ', err.response.body.code +' ' + err.response.body.message);
         } 
         this.isBusy = false;
         return -1;
    }

    // Start for periodic refresh of devices
    startPollingProcess()
    {
        // Set time to refresh devices
        this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime); 
     
    };

    // The session key must be periodically refresh. This method call the authentication process to re-login and 
    // get a new session key and store for later transaction.
    async refreshSessionKey() {

        // Clear prior session handles
        if (this.sessionKeyRefreshHandle) 
        {
            clearTimeout(this.sessionKeyRefreshHandle);
            this.sessionKeyRefreshHandle = null;
        }

        // Start the authentication process, no need to wait for return. 
        this.authenticate();

        // Set timer to refresh devices
        this.sessionKeyRefreshHandle = setTimeout(() => this.refreshSessionKey(), this.sessionKeyRefreshTime); 
    }

    // Uses the Frigidaire API to fetch details for a given appliance. Will authenticate if the request fails
    async backgroundRefresh() {

        if (this.deviceRefreshHandle) 
        {
            clearTimeout(this.deviceRefreshHandle);
            this.deviceRefreshHandle = null;
        }
        if (this.isBusy) {
           this.log.warn("Another process is already updating. Skipping Interval Update.")
           this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime); 
           return;
        }
        // Do we have valid sessions? 
        var authResponse = true;
        if (!(await this.isValidSession())) {
           // session is expired or not login, get new session key
           this.log.warn('Background refreshing detected sessions is no longer valid, attempting to re-login.',);
            authResponse = await this.authenticate();
            if (authResponse) this.log.info('re-login successful.')
        }
        // Update data elements
        if (authResponse) await this.refreshDevices();
      
        // Set timer to refresh devices
        this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime); 
    }
}

module.exports = Frigidaire;