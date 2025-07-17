
const EventEmitter = require('events');
const superagent = require('superagent');
const storage = require('node-persist');

// Writeable settings that are known valid names of Components.
// These can be passed to the execute_action() API together with a target value
// to change settings.
 const FAN_SPEED = "fanSpeedSetting"
 const EXECUTE_COMMAND = "executeCommand"
 const MODE = "mode"
 const SLEEP_MODE = "sleepMode"
 const UI_LOCK_MODE = "uiLockMode"
 const VERTICAL_SWING = "verticalSwing"
 const PUMP_MODE= "condensatePump"


 // Filter status
 const BUY = "BUY"
 const CHANGE = "CHANGE"
 const CLEAN = "CLEAN"
 const GOOD = "GOOD"

const DEHUMIDIFIER = "DH"; // FGAC5045W1
const DEHUMIDIFIER_HUSKY = "Husky"; //FHDD5033W1

 const FAHRENHEIT = "FAHRENHEIT"
 const CELSIUS = "CELSIUS"
 const DISPLAY_LIGHT = "displayLight"
 const CLEAN_AIR_MODE = "cleanAirMode"
 const SENSOR_HUMIDITY = "sensorHumidity"
 const START_TIME = "startTime"
 const STOP_TIME = "stopTime"
 const TARGET_HUMIDITY = "targetHumidity"
 const WATER_BUCKET_LEVEL = "waterBucketLevel"
 const ALERTS = "alerts"
 const APPLIANCE_STATE = "applianceState"
 const APPLIANCE_UI_SW_VERSION = "applianceUiSwVersion"
 const FAN_SPEED_STATE = "fanSpeedState"
 const FILTER_STATE = "filterState"
 const NETWORK_INTERFACE = "networkInterface"

// Dehumidifier Modes
 const DRY = 'DRY'
 const AUTO = 'AUTO'
 const CONTINUOUS = 'CONTINUOUS'
 const QUIET = 'QUIET'
 
// fan speed
 const LOW = 'LOW'
 const MEDIUM = 'MIDDLE'
 const HIGH = 'HIGH'

 const POWER_ON = 'ON'
 const POWER_OFF = 'OFF'
 const APP_OFF = "OFF"
 const APP_RUNNING = "RUNNING"

 const CLEANAIR_ON = 'ON'
 const CLEANAIR_OFF = 'OFF'
 const CLEANAIR_NOT_PRESENT = 'NA'

 const UI_ON = 'ON'
 const UI_OFF = 'OFF'

 const PUMP_ON = 'ON'
 const PUMP_OFF = 'OFF'
 const PUMP_NOT_PRESENT = 'NA'





 const DEHUMIDIFIERMODES = new Set([DRY,AUTO,CONTINUOUS,QUIET]);
 const DEHUMIDIFIERFANMODES = new Set([MEDIUM,LOW,HIGH]);
 
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
 
class Frigidaire extends EventEmitter {
    auth_token = {};
    excludedDevices = []
    log = {};
    deviceRefreshHandle;
    accessTokenRefreshHandle;
    deviceRefreshTime;
    accessTokenRefreshTime;
    pollingInterval;
    persistPath;
    frig_devices = [];
    lastUpdate;
    updateTimer = [];
    v3globalxapikey;
    v3oauthclientid;
    v3oauthclientscrt;
    v3refreshToken;
    v3accessToken;
    v3apikey;
    v3domain;
    v3datacenter;
    v3httpregionalbaseurl;
    v3appToken;

    constructor(log, config, persistPath) {
        super();
        this.log = log || console.log;
        this.persistPath = persistPath;
        this.excludedDevices = config.excludedDevices || [];
        this.auth_token.username = config.auth.username;
        this.auth_token.password = config.auth.password;
        this.deviceRefreshTime = config.deviceRefresh * 1000 || 90000; // default to 90 secs, so we don't hammer their servers
        this.lastUpdate = null;  
        this.isBusy = false;     
        this.v3globalxapikey = '3BAfxFtCTdGbJ74udWvSe6ZdPugP8GcKz3nSJVfg' //DO NOT CHANGE
        this.v3oauthclientid = 'FrigidaireOneApp' //DO NOT CHANGE
        this.v3oauthclientscrt = '26SGRupOJaxv4Y1npjBsScjJPuj7f8YTdGxJak3nhAnowCStsBAEzKtrEHsgbqUyh90KFsoty7xXwMNuLYiSEcLqhGQryBM26i435hncaLqj5AuSvWaGNRTACi7ba5yu' //DO NOT CHANGE
        this.v3refreshToken = null
        this.v3accessToken = null
        this.v3apikey = null
        this.v3domain = null
        this.v3datacenter = null
        this.v3httpregionalbaseurl = null
        this.v3appToken = null

    };

    // Initialization routine
    async init() {

        // Retrieve login storage login information
         if(this.persistPath != undefined)
         {
             // Initializes the storage
             await storage.init({dir:this.persistPath, forgiveParseErrors: true})
             // Get persist items, if exist...
            this.v3accessToken  = await storage.getItem('frigidaire_accesstoken') 
            this.v3refreshToken = await storage.getItem('frigidaire_refreshtoken')
            this.v3apikey = await storage.getItem('frigidaire_apikey')
            this.v3datacenter = await storage.getItem('frigidaire_datacenter')
            this.v3domain = await storage.getItem( 'frigidaire_domain')
            this.v3httpregionalbaseurl = await storage.getItem('frigidaire_httpreginal')
            this.v3appToken = await storage.getItem('frigidaire_apptoken')
            if((this.v3accessToken != null) && (this.v3refreshToken!=null)) this.log.info("Frigidaire: Using local access token");
            
        }
        // Login frigidaire service    
        try {
             // If end information is not present obtain
            if (this.v3httpregionalbaseurl == null) {
                const endPointResponse = await this.endPointDetails();
            }
            // If token not present or expired obtain new token
            if (this.v3accessToken != null) {
                if (this.isAccessTokenExpired()) {
                    // obtain new access token
                    const authResponseRefresh = await this.refreshAccessToken();
                    if (authResponseRefresh) {
                        this.log.info('Frigidaire: Login complete, obtained new Access token from Refresh token.'); 
                    }  else return false;
                }
                else
                    this.log.info('Frigidaire: Login complete, using existing Access and Refresh token');
            }
            else {
            // Do full user Authenticate user           
                const authResponse = await this.authenticate();
                //if login successful, get devices/appliances
                if (authResponse) {
                    this.log.info('Frigidaire: Login complete, new Access and Refresh token obtain.'); 
                }
                else return false;
            }
        }  catch (err) {
                this.log.error('Frigidaire Initialization Error: ',err);
                return false;

        }
        // Login was successful display access token data
        this.log.info('Frigidaire: ' + this.getAccessTokenInfo());
        await this.discoverDevices();
        // Set access token renewal
        this.accessTokenRefreshHandle = setTimeout(() => this.refreshAccessToken(), this.getAccessTokenTimeout()); 
        return true;
    }

    // Authenticates with the Frigidaire API. This will be used re-authenticate if the session key is deemed invalid and will
    // throw an exception if the authentication request fails or returns an unexpected response.
    async endPointDetails() {

        var appOneBody = {
            "grantType": "client_credentials",
            "clientId": this.v3oauthclientid,
            "clientSecret": this.v3oauthclientscrt,
            "scope": ""
        }
        this.log.debug('Getting Endpoint details...');
        try {
            const responseEndToken = await superagent
                                .post('https://api.ocp.electrolux.one/one-account-authorization/api/v1/token')
                                .send(appOneBody) // sends a JSON post body
                                .disableTLSCerts();
            
            this.v3appToken = responseEndToken.body['accessToken']
            var appOneAccountHeader = {
                'Accept-Charset': 'UTF-8',
                'Accept': 'application/json',
                'x-api-key': this.v3globalxapikey,
                'Authorization': 'Bearer ' + this.v3appToken 
            }
            const responseEndPointDetails = await superagent
                                .get('https://api.ocp.electrolux.one/one-account-user/api/v1/identity-providers?brand=frigidaire&countryCode=US')
                                .set(appOneAccountHeader)
                                .disableTLSCerts();

            if (responseEndPointDetails.statusCode< 199 || responseEndPointDetails.statusCode > 299) {
                this.log.error("Frigidaire Endpoint Get Error: " + responseEndPointDetails.statusCode + " " + responseEndPointDetails.statusMessage);
                return true;
            }

            this.log.debug('FrigidaireApp Endpoint Details: ' + JSON.stringify(responseEndPointDetails.body));
           
            this.v3apikey = responseEndPointDetails.body[0]['apiKey']
            this.v3datacenter = responseEndPointDetails.body[0]['dataCenter']
            this.v3domain = responseEndPointDetails.body[0]['domain']
            this.v3httpregionalbaseurl = responseEndPointDetails.body[0]['httpRegionalBaseUrl']
            if(this.persistPath != undefined)
            {
                storage.setItem('frigidaire_apikey',this.v3apikey);
                storage.setItem('frigidaire_datacenter',this.v3datacenter);
                storage.setItem('frigidaire_domain',this.v3domain);
                storage.setItem('frigidaire_httpreginal',this.v3httpregionalbaseurl);
                storage.setItem('frigidaire_apptoken',this.v3appToken);

            }
            return true;
        }  
        catch (err) {
                this.log.error("Frigidaire Endpoint Error: ", err.status,  err.message);
                return false;
         }
    }

    // Do full login using username and password. This will obtain a new access token and refresh token
    async authenticate() {
        var loginUrl = 'https://accounts.' + this.v3domain + '/accounts.login'
        var queryString = 'format=json&httpStatusCodes=false&include=id_token&apikey=' + this.v3apikey + '&loginID=' + this.auth_token.username + '&password=' + this.auth_token.password
        var fullLoginUrl = loginUrl + '?' + queryString;
        var loginHeader = {
            "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 12; sdk_gphone64_x86_64 Build/SE1A.220826.008)",
            "Accept": "application/json",
            'content-type': 'application/json'
        }
        // Login URL
        this.log.debug("Frigidaire authenticate URL: " +  fullLoginUrl);

        try {
            const fullLoginResponse = await superagent
                .get(fullLoginUrl)
                .set(loginHeader)
                .accept('json')
                .disableTLSCerts();
       
           var fullLoginResponseBody = JSON.parse(fullLoginResponse.text)
         
            if (fullLoginResponse.statusCode < 200 || fullLoginResponse.statusCode > 299) {
                    this.log.error('Frigidaire Login error: ' + fullLoginResponse.statusCode + ' ' + fullLoginResponse.statusMessage)
                    return false;
            }
            var accessTokenURL = this.v3httpregionalbaseurl + '/one-account-authorization/api/v1/token'
            var accessHeaders = {
                "x-api-key": this.v3globalxapikey,
                "Origin-Country-Code": this.v3datacenter
            }
            var accessTokenBody = {
                "grantType": "urn:ietf:params:oauth:grant-type:token-exchange",
                "clientId": this.v3oauthclientid,
                "idToken": fullLoginResponseBody.id_token,
                "scope": ""
            }

            const responseAccessToken = await superagent
                                .post(accessTokenURL)
                                .set(accessHeaders) 
                                .send(accessTokenBody) // sends a JSON post body
                                .disableTLSCerts();

            this.log.debug('Access Token: Return' +  responseAccessToken.body.accessToken)
            this.log.debug('Refresh Token: Return' +  responseAccessToken.body.refreshToken)
       
            if (responseAccessToken.statusCode < 199 || responseAccessToken.statusCode > 299) {
                this.log.error('Frigidaire token error: ' + responseAccessToken.body.error + ' ' + responseAccessToken.body.message)
                return false;
            }
            else {
                this.v3refreshToken = responseAccessToken.body.refreshToken
                this.v3accessToken =responseAccessToken.body.accessToken
                if(this.persistPath != undefined)
                {
                    storage.setItem('frigidaire_accesstoken',this.v3accessToken);
                    storage.setItem('frigidaire_refreshtoken',this.v3refreshToken);
                }
            }
            this.log.debug("Frigidaire Authenticate complete");
            return true;
        }
        catch (err) {
            this.log.error("Frigidaire Login Error: ", err.status,  err.message);
            return false;
        }
    }

    // Discover devices in account and built out the the array
    async discoverDevices () {

        var uri = '/appliance/api/v2/appliances?includeMetadata=true'
        var headers = {
            "User-Agent": "Ktor client",
            "Accept": "application/json",
            'content-type': 'application/json',
            'x-api-key': this.v3globalxapikey,
            'Authorization': 'Bearer ' + this.v3accessToken.trim()
        }
        this.log.debug("Frigidaire device discover: " +  this.v3httpregionalbaseurl + uri);
        try {
            const responseDevice = await superagent
                                .get(this.v3httpregionalbaseurl + uri)
                                .set(headers)
                                .disableTLSCerts();

            if (responseDevice.statusCode < 199 || responseDevice.statusCode > 299) {
                    this.log.error("Frigidaire device discover get Error: " + responseDevice.body.error + " " + responseDevice.body.message);
            }
           
            var deviceJSON = responseDevice.body;
            // create device list from user profile.
            for(var i in deviceJSON) {
                // used for debugging -- Dump all devices discovered at start up
                this.log.debug("Device Refresh: " + JSON.stringify(deviceJSON[i], null, 2));

                if (this.excludedDevices.includes(deviceJSON[i]['applianceId'])) {
                    this.log(`Executing Device with name: '${deviceJSON[i]['applianceName']}'`);
                    
                } else {
                    var device = {};
                    var applianceIdArray = [];
                    
                    switch (deviceJSON[i]['applianceData']['modelName']) {
                        case DEHUMIDIFIER:
                            var deviceStatus = deviceJSON[i]['properties']['reported'];
                            device.deviceId = deviceJSON[i]['applianceId'];
                            device.name = deviceJSON[i]['applianceData']['applianceName'];
                            device.destination = deviceJSON[i]['applianceData']['modelName'];
                            device.roomHumidity = deviceStatus['sensorHumidity'];
                            device.targetHumidity = deviceStatus['targetHumidity'];
                            device.mode = deviceStatus['mode'].toUpperCase();
                            device.filterStatus = deviceStatus['filterState'].toUpperCase();
                            device.fanMode = deviceStatus['fanSpeedSetting'].toUpperCase();
                            device.clearAirMode = deviceStatus['cleanAirMode'].toUpperCase();
                            device.childMode = deviceStatus['uiLockMode'];
                            device.bucketStatus = deviceStatus['waterBucketLevel'];
                            device.firmwareVersion = deviceStatus['networkInterface']['swVersion'];
                            device.applianceState = deviceStatus['applianceState'].toUpperCase();
                            device.pumpStatus = PUMP_NOT_PRESENT;

                            device.pnc = device.deviceId?.split(':')[0]?.split('_')[0] ?? 0;
                            device.elc = device.deviceId?.split(':')[0]?.split('_')[1] ?? 0;
                            device.serialNumber = device.deviceId?.split(':')[1]?.split('-')[0] ?? 0;
                            device.mac = device.deviceId?.split(':')[1]?.split('-')[1] ?? 0;

                            applianceIdArray = [device.deviceId];
                            device.model = await this.getDetailForDevice(applianceIdArray);
                            // storage values to determine if anything needs to be updated.
                            device.monitoredValues = deviceStatus['sensorHumidity']
                                        + deviceStatus['mode'] 
                                        + deviceStatus['applianceState']
                                        + deviceStatus['filterState']
                                        + deviceStatus['fanSpeedSetting']
                                        + deviceStatus['targetHumidity']
                                        + deviceStatus['cleanAirMode']
                                        + deviceStatus['waterBucketLevel'];

                            device.lastUpdate = Date.now();
                            this.frig_devices.push(device);
                        break;
                        case DEHUMIDIFIER_HUSKY:
                            var deviceStatus = deviceJSON[i]['properties']['reported'];
                            device.deviceId = deviceJSON[i]['applianceId'];
                            device.name = deviceJSON[i]['applianceData']['applianceName'];
                            device.destination = deviceJSON[i]['applianceData']['modelName'];
                            device.roomHumidity = deviceStatus['sensorHumidity'];
                            device.targetHumidity = deviceStatus['targetHumidity'];
                            device.mode = deviceStatus['mode'].toUpperCase();
                            device.filterStatus = deviceStatus['filterState'].toUpperCase();
                            device.fanMode = deviceStatus['fanSpeedSetting'].toUpperCase();
                            device.bucketStatus = (deviceStatus['waterTankFull'].toUpperCase()== "NO") ? 0 : 100;
                            device.applianceState = deviceStatus['applianceState'].toUpperCase();
                            device.pumpStatus = deviceStatus['condensatePump'].toUpperCase();
                            device.clearAirMode = CLEANAIR_NOT_PRESENT;
                            device.serialNumber = 0;
                            
                            // storage values to determine if anything needs to be updated.
                            device.monitoredValues = deviceStatus['sensorHumidity']
                                        + deviceStatus['mode'] 
                                        + deviceStatus['applianceState']
                                        + deviceStatus['filterState']
                                        + deviceStatus['fanSpeedSetting']
                                        + deviceStatus['targetHumidity']
                                        + deviceStatus['waterTankFull']
                                        + deviceStatus['condensatePump'];

                            device.lastUpdate = Date.now();
                            this.frig_devices.push(device);
                        break;
                        default:
                            this.log.debug("Device not supported by this plug-in: " + deviceJSON[i]['applianceData']['modelName']);
                        continue; // skip to next device
                    }
                }
            }
        }
        catch (err) {
            this.log.error("Frigidaire Device Error: ", err.status,  err.message);
            return false;

        }
        this.log.debug("Frigidaire device discover complete");
        return true;
    }

    // For each device on list get the detail, if the device has change emit a change to allow accessory to capture the change. 
    async refreshDevices () {

        // Performing update don't allow other processes
        if (this.isBusy) return;

        this.isBusy = true;
        var uri = '/appliance/api/v2/appliances?includeMetadata=false'
        var headers = {
            "User-Agent": "Ktor client",
            "Accept": "application/json",
            'content-type': 'application/json',
            'x-api-key': this.v3globalxapikey,
            'Authorization': 'Bearer ' + this.v3accessToken.trim()
        }
        this.log.debug("Frigidaire device refresh: " +  this.v3httpregionalbaseurl + uri);
        try {
            const responseDevice = await superagent
                                .get(this.v3httpregionalbaseurl + uri)
                                .set(headers)
                                .disableTLSCerts();

            if (responseDevice.statusCode < 199 || responseDevice.statusCode > 299) {
                    this.log.error("Frigidaire refresh device get Error: " + responseDevice.body.error + " " + responseDevice.body.message);
            }
            var deviceJSON = responseDevice.body;

            // create device list from user profile.
            for(var i in deviceJSON) {
                
                 // find device and determine if it needs to be updated.
                 var findIndex = this.frig_devices.findIndex(device => device.deviceId === deviceJSON[i]['applianceId']);
                 if (findIndex > -1)
                 { 
                    // Found device at the following index
                    this.log.debug("Device Refresh: " + JSON.stringify(deviceJSON[i], null, 2));

                    // Get update information from API for compare and updating.
                    var deviceStatus = deviceJSON[i]['properties']['reported'];
                    switch (deviceJSON[i]['applianceData']['modelName']) {
                        case DEHUMIDIFIER:
                            //Determine if anything has changed since last get, if yes update lastupdate date.
                            var hasMonitoredValuesChanged = deviceStatus['sensorHumidity']
                                        + deviceStatus['mode'] 
                                        + deviceStatus['applianceState']
                                        + deviceStatus['filterState']
                                        + deviceStatus['fanSpeedSetting']
                                        + deviceStatus['targetHumidity']
                                        + deviceStatus['cleanAirMode']
                                        + deviceStatus['waterBucketLevel'];
                
                            if (hasMonitoredValuesChanged != this.frig_devices[findIndex].monitoredValues) {
                                this.log.debug("Device Update detected.");
                                this.frig_devices[findIndex].monitoredValues = hasMonitoredValuesChanged;
                                this.frig_devices[findIndex].lastupdate = Date.now();
                                this.frig_devices[findIndex].roomHumidity = deviceStatus['sensorHumidity'];
                                this.frig_devices[findIndex].targetHumidity = deviceStatus['targetHumidity'];
                                this.frig_devices[findIndex].mode = deviceStatus['mode'].toUpperCase();
                                this.frig_devices[findIndex].filterStatus = deviceStatus['filterState'].toUpperCase();
                                this.frig_devices[findIndex].fanMode = deviceStatus['fanSpeedSetting'].toUpperCase();
                                this.frig_devices[findIndex].clearAirMode = deviceStatus['cleanAirMode'].toUpperCase();
                                this.frig_devices[findIndex].childMode = deviceStatus['uiLockMode'];
                                this.frig_devices[findIndex].bucketStatus = deviceStatus['waterBucketLevel'];
                                this.frig_devices[findIndex].applianceState = deviceStatus['applianceState'].toUpperCase();
                                this.emit(this.frig_devices[findIndex].deviceId, {
                                    device: this.frig_devices[findIndex]
                                })
                            }
                        break;
                        case DEHUMIDIFIER_HUSKY:
                            //Determine if anything has changed since last get, if yes update lastupdate date.
                            var hasMonitoredValuesChanged = deviceStatus['sensorHumidity']
                                        + deviceStatus['mode'] 
                                        + deviceStatus['applianceState']
                                        + deviceStatus['filterState']
                                        + deviceStatus['fanSpeedSetting']
                                        + deviceStatus['targetHumidity']
                                        + deviceStatus['waterTankFull']
                                        + deviceStatus['condensatePump'];
                                
                            if (hasMonitoredValuesChanged != this.frig_devices[findIndex].monitoredValues) {
                                this.log.debug("Device Update detected.");
                                this.frig_devices[findIndex].monitoredValues = hasMonitoredValuesChanged;
                                this.frig_devices[findIndex].lastupdate = Date.now();
                                this.frig_devices[findIndex].roomHumidity = deviceStatus['sensorHumidity'];
                                this.frig_devices[findIndex].targetHumidity = deviceStatus['targetHumidity'];
                                this.frig_devices[findIndex].mode = deviceStatus['mode'].toUpperCase();
                                this.frig_devices[findIndex].applianceState = deviceStatus['applianceState'].toUpperCase();
                                this.frig_devices[findIndex].filterStatus = deviceStatus['filterState'].toUpperCase();
                                this.frig_devices[findIndex].fanMode = deviceStatus['fanSpeedSetting'].toUpperCase();
                                this.frig_devices[findIndex].bucketStatus = (deviceStatus['waterTankFull'].toUpperCase() == "NO") ? 0 : 100;
                                this.frig_devices[findIndex].fanMode = deviceStatus['condensatePump'].toUpperCase();
                                this.emit(this.frig_devices[findIndex].deviceId, {
                                    device: this.frig_devices[findIndex]
                                })
                            }
                        break;
                    }
                }
                else this.log.debug(`Device not found: ${deviceJSON[i]['applianceId']}`);
            }
        }
        catch (err) {
            this.log.error("Frigidaire Device Error: ", err.status,  err.message);
            this.isBusy = false;
            return false;

        }
        this.isBusy = false;
        this.log.debug("Frigidaire device refresh complete.");
        return true;
    }

    // Uses the Frigidaire API to fetch details for a given appliance
    async getDetailForDevice(deviceID) {
       
        var detailForDevice = {};
        var uri = '/appliance/api/v2/appliances/info'
        var headers = {
            "User-Agent": "Ktor client",
            "Accept": "application/json",
            'content-type': 'application/json',
            'x-api-key': this.v3globalxapikey,
            'Authorization': 'Bearer ' + this.v3accessToken.trim()
        }
        var deviceBody = {
            "applianceIds": deviceID
        }
        this.log.debug("Frigidaire device detail: " + this.v3httpregionalbaseurl + uri);
        try {
            const responseDevice = await superagent
                    .post(this.v3httpregionalbaseurl + uri)
                    .set(headers) 
                    .send(deviceBody) // sends a JSON post body
                    .disableTLSCerts();

            var deviceJSON = responseDevice.body;

            // create detail information list from return values
            for(var i in deviceJSON) {
                detailForDevice.modelName = deviceJSON[i].model;
                detailForDevice.modelVariant = deviceJSON[i].variant;
                detailForDevice.modelColor = deviceJSON[i].colour;
            }

        }
        catch (err) {

            this.log.error('Frigidaire device detail Error: ', err.status,  err.message);
            return false;
        }
        this.log.debug("Frigidaire device detail complete.");
        return detailForDevice;
    }   

    async setDevicePowerMode(deviceIndex, onValue = false){
          // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
        var returnCode = 0;
        
        if (onValue) returnCode = await this.sendDeviceCommand(deviceIndex,EXECUTE_COMMAND,POWER_ON) 
        else returnCode = await this.sendDeviceCommand(deviceIndex,EXECUTE_COMMAND,POWER_OFF) 
        if (returnCode == 200)
        {
            this.frig_devices[deviceIndex].mode = onValue;
            if (!onValue) {
                this.frig_devices[deviceIndex].clearAirMode = CLEANAIR_OFF;
                this.emit(this.frig_devices[deviceIndex].deviceId, {
                    device: this.frig_devices[deviceIndex]
                })
            }
            return onValue;
        }
        return -1;
    }

    async setDehumidifierMode(deviceIndex, DehumMode = AUTO){
        // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
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

    async setDehumidifierFanMode(deviceIndex,fanModeValue = LOW){
          // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
          // Is validate mode?
        if(!DEHUMIDIFIERFANMODES.has(fanModeValue)) return false;
        var returnCode = 0;
        // check if appliance is in auto model? If auto fam mode is automatically and can't be adjusted.
        if (this.frig_devices[deviceIndex].mode == AUTO) return false;
        returnCode = await this.sendDeviceCommand(deviceIndex,FAN_SPEED, fanModeValue);
        if (returnCode == 200)
         {
            this.frig_devices[deviceIndex].fanMode = fanModeValue;
            return fanModeValue;
        }
        return -1;
    }
    
    async setDehumidifierRelativeHumidity(deviceIndex, humidityLevel = 50) {
        // Is request out of bounds base on discovered device?

        if(this.frig_devices.length <= deviceIndex) return false;
        // Is a dehumidifier appliance?
        var returnCode = 0;
        // determine if the humidity level is within acceptable range.
        if (humidityLevel >= 35 && humidityLevel <= 85) {
            // round to nearest multiple of 5.
            humidityLevel = Math.ceil(humidityLevel/5)*5;
            // If mode is not in auto mode that change set humidity level. 
            // check if appliance is in auto model? If auto fam mode is automatically and can't be adjusted.
            if (this.frig_devices[deviceIndex].mode == AUTO) return false;
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
            this.emit(this.frig_devices[deviceIndex].deviceId, {
                device: this.frig_devices[deviceIndex]
            })
            return modeValue;
        }
        
        return -1;
    }

    async setDehumidifierUILock(deviceIndex, modeValue = UI_OFF){
           // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
        // Is a dehumidifier appliance?
        if(this.frig_devices[deviceIndex].destination != DEHUMIDIFIER) return false;
        var returnCode = 0;
        // Send command to API endpoint base on user selection 
        if (modeValue == UI_ON) returnCode = await this.sendDeviceCommand(deviceIndex,UI_LOCK_MODE,UI_ON); 
        else returnCode = await this.sendDeviceCommand(deviceIndex,UI_LOCK_MODE,UI_OFF); 
        if (returnCode == 200)
        {
            this.frig_devices[deviceIndex].childMode = modeValue;
            return modeValue;
        } 
        return -1;
    }

    async setDehumidifierPump(deviceIndex, modeValue = PUMP_ON){
           // Is request out of bounds base on discovered device?
        if(this.frig_devices.length <= deviceIndex) return false;
        // Is a dehumidifier appliance?
        if(this.frig_devices[deviceIndex].destination != DEHUMIDIFIER_HUSKY) return false;
        var returnCode = 0;
        // Send command to API endpoint base on user selection 
        if (modeValue == PUMP_ON) returnCode = await this.sendDeviceCommand(deviceIndex,PUMP_MODE,PUMP_ON); 
        else returnCode = await this.sendDeviceCommand(deviceIndex,PUMP_MODE,PUMP_OFF); 
        if (returnCode == 200)
        {
            this.frig_devices[deviceIndex].childMode = modeValue;
            return modeValue;
        } 
        return -1;
    }

    // Executes any defined action on a given appliance. Will authenticate if the request fails
    async sendDeviceCommand(deviceIndex,attribute, value) {
       
        let uri = this.v3httpregionalbaseurl + '/appliance/api/v2/appliances/' + this.frig_devices[deviceIndex].deviceId + '/command'
        var headers = {
            "User-Agent": "Ktor client",
                "Accept": "application/json",
                'content-type': 'application/json',
                'x-api-key': this.v3globalxapikey,
                'Authorization': 'Bearer ' +  this.v3accessToken.trim()
        }
        var action = {}
        action[attribute] = value

        this.log.debug("Sending command to..." + uri);
        this.log.debug("Action command: " + JSON.stringify(action));

        this.isBusy = true;
        // Block other activities during updates
       try {
            const response = await superagent
                                .put(uri)
                                .set(headers)
                                .send(action)
                                .disableTLSCerts();
            if (response.statusCode != 200) {
                this.log.error('Frigidaire Send Error: ' + response.body.code + ' ' + response.body.message);
            }
            else
               {
                this.isBusy = false;
                this.log.debug('Send Command complete');
                return response.statusCode;
               }
        }
          catch (err) {
            this.log.error('Frigidaire post Error: ',  err.status,  err.message);
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

    // Determine if access token is still validated
    isAccessTokenExpired() {
        let parsedAccessToken =  JSON.parse(Buffer.from(this.v3accessToken.split('.')[1], 'base64').toString());
        if ((parsedAccessToken['exp'] * 1000) - 600000 > Date.now()) {
            return false
        }
        else return true;
    }

     // Get Access token details/information
    getAccessTokenInfo() {
        let parsedAccessToken =  JSON.parse(Buffer.from(this.v3accessToken.split('.')[1], 'base64').toString());
        let expDateStr = new Date(parsedAccessToken['exp'] * 1000).toISOString()
        let issuedDateStr = new Date(parsedAccessToken['iat'] * 1000).toISOString()
        let renewDateStr = new Date((parsedAccessToken['exp'] * 1000) - 600000).toISOString()
        let nowDateStr = new Date(Date.now()).toISOString()
        return ('Access Token | Expiration: ' + expDateStr + ' Issued: ' + issuedDateStr + ' Renew at: ' + renewDateStr + ' Now: ' + nowDateStr);
    }

    // From expiration time of access token determine time to obtain new access using refresh token.
    getAccessTokenTimeout() {
        let parsedAccessToken =  JSON.parse(Buffer.from(this.v3accessToken.split('.')[1], 'base64').toString());
        let accessTokenExpTime = new Date((parsedAccessToken['exp'] * 1000) - 600000)
        let currentTime = new Date(Date.now());
        return Math.max(0,(accessTokenExpTime.getTime() - currentTime.getTime()));
    
    }

    // The session key must be periodically refresh. This method call the authentication process to re-login and 
    // get a new session key and store for later transaction.
    async refreshAccessToken() {
        // Clear prior session handles
        if (this.accessTokenRefreshHandle) 
        {
            clearTimeout(this.accessTokenRefreshHandle);
            this.accessTokenRefreshHandle = null;
        }
        this.isBusy = true;
        // Are we past period that refreshing token can be used?
        if (this.getAccessTokenTimeout() != 0) {

            var refreshTokenUrl = this.v3httpregionalbaseurl + '/one-account-authorization/api/v1/token'
            var refreshheader = {
                "Origin-Country-Code": this.v3datacenter,
                "x-api-key": this.v3globalxapikey
            }
            var refreshTokenBody = {
                "grantType": "refresh_token",
                "clientId": this.v3oauthclientid,
                "refreshToken": this.v3refreshToken
            }
            this.log.debug('Frigidaire Access refreshing:' + refreshTokenUrl )
            try {
                const responseRefreshToken = await superagent
                    .post(refreshTokenUrl)
                    .set(refreshheader) 
                    .send(refreshTokenBody) // sends a JSON post body
                    .disableTLSCerts();


                this.log.debug('Access Token: Return' +  responseRefreshToken.body.accessToken)
                this.log.debug('Refresh Token: Return' +  responseRefreshToken.body.refreshToken)

                if (responseRefreshToken.statusCode < 200 || responseRefreshToken.statusCode > 299) {
                    this.log.error('Frigidaire token error: ' + responseRefreshToken.body.error + ' ' + responseRefreshToken.body.message)
                    this.isBusy = false;
                    return false;
                }
                else {
                    this.v3refreshToken = responseRefreshToken.body.refreshToken
                    this.v3accessToken =responseRefreshToken.body.accessToken
                }
                if(this.persistPath != undefined)
                {
                    storage.setItem('frigidaire_accesstoken',this.v3accessToken);
                    storage.setItem('frigidaire_refreshtoken',this.v3refreshToken);
                }
            }
            catch (err) {
                this.log.error("Frigidaire Login Error: ", err.status,  err.message);
                this.isBusy = false;
                return false;
            }
        } else {

            const authResponseRefresh = await this.authenticate();
            if (!authResponseRefresh) {
                this.isBusy = false;
                return false;
            }

        }
        this.accessTokenRefreshHandle = setTimeout(() => this.refreshAccessToken(), this.getAccessTokenTimeout()); 
        this.isBusy = false;
        return true;
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
           return false;
        }
        // Do we have valid token? 
        var authResponseRefresh = true;
        if (this.isAccessTokenExpired()) {
            // obtain new access token
            authResponseRefresh = await this.refreshAccessToken();
            if (authResponseRefresh) this.log.info('Frigidaire: Obtained new Access token from Refresh token in background process'); 
            
        }
        // Update data elements
        if (authResponseRefresh) await this.refreshDevices();
      
        // Set timer to refresh devices
        this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime); 
        return true;
    }
}

module.exports = Frigidaire;