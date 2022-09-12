
const EventEmitter = require('events');
const superagent = require('superagent');
const randomstring = require('randomstring');


// URL constant for retrieving data

const APIURL = 'https://api.latam.ecp.electrolux.com'
const CLIENTID = 'e9c4ac73-e94e-4b37-b1fe-b956f568daa0'
const USERAGENT = 'Frigidaire/81 CFNetwork/1121.2.2 Darwin/19.2.0'
const BASICAUTHTOKEN = 'dXNlcjpwYXNz'
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

class Frigidaire extends EventEmitter {
    auth_token = {};
    excludedDevices = []
    log;
    deviceRefreshHandle;
    deviceRefreshTime;
    debug;
    clientId;
    userAgent;
    basicAuthToken;
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
        this.auth_token.sessionKey ="";
        this.clientId = CLIENTID;
        this.userAgent = USERAGENT;
        this.basicAuthToken = BASICAUTHTOKEN;
        this.deviceId = this.GenerateId();
        this.country =COUNTRY;
        this.brand =BRAND;
        this.sessionKey = null;
        this.deviceRefreshTime = config.deviceRefreshTime || 10000; // default to 10 seconds, so we don't hammer their servers
        this.attempts = 0;
        this.lastUpdate = null;       
    };

    // Initization routine
    async init() {

        // Authenticate user
        try {
            const authResponse = await this.authenticate();
            return authResponse;

        }  catch (err) {
                return false;

        }

        /*var device = {};
        device.deviceId = '11904976-443E071C2589';
        device.serialNumber = '11904976';
        device.name = 'Basement Dehumidifier ';
        device.mac = '443E071C2589';
        device.pnc ='950133061';
        device.elc = '00';
        device.cpv = '00';
        device.fanMode = 4;
        device.filterStatus = 0;
        device.roomHumidity = 55;
        device.targetHumidity = 70;
        device.bucketStatus = 0;
        device.clearAirMode = 0;
        device.childMode = 0;
        device.firmwareVersion = 'v1.9.1_srac';
        device.mode = 0;
        device.destination = 'DH1';
        this.frig_devices.push(device);*/
        
    }

    // Initial login
    async authenticate() {

        var headers = {
            'x-ibm-client-id': this.clientId,
            'User-Agent': this.userAgent,
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + this.basicAuthToken
        }

        var authBody = {
            "username": this.auth_token.username,
            "password": this.auth_token.password,
            "brand": this.brand,
            "deviceId": this.deviceId,
            "country": this.country,
        }

        var authUrl = APIURL + '/authentication/authenticate';
        try {
            const response = await superagent
                                .post(authUrl)
                                .send(authBody) // sends a JSON post body
                                .set(headers)
                                .set('accept', 'json')
                                .disableTLSCerts();
            if (response.body.status == 'ERROR' && response.body.code != 'ECP0000') {
                console.error("Frigidair Login Error: " + response.body.code + " " + response.body.message);
            } 
            else {
                this.sessionKey = response.body.data.sessionKey;
                if (this.sessionKey != "") return true;
            }
          } 
          catch (err) {
                console.error(err);
                return false;
         }
    }

    async isValidSession() {
        var uri = "/config-files/haclmap/latest_version";
        try {
            const sessionValidationResponse = await this.getRequest(uri);
            if (sessionValidationResponse.status_code != 200) return false;

        }  catch (err) {
                return false;

        }
    };

    async getDevices () {
        var uri = '/user-appliance-reg/users/' + this.auth_token.username + '/appliances?country=' + COUNTRY + '&includeFields=true';
        
        try {
            const deviceJSON = await this.getRequest(uri);
            // create device list from user profile.
            for(var i in deviceJSON) {
                if (this.excludedDevices.includes(deviceJSON[i]['nickname'])) {
                    console.log(`Executing Device with name: '${deviceJSON[i]['nickname']}'`);
                    
                } else {
                    var device = {};

                    device.deviceId = deviceJSON[i]['appliance_id'];
                    device.serialNumber = deviceJSON[i]['sn']; //Serial number
                    device.name = deviceJSON[i]['nickname'];
                    device.mac = deviceJSON[i]['mac']; // MAC address
                    device.pnc = deviceJSON[i]['pnc']; // Product code
                    device.elc = deviceJSON[i]['elc'];
                    device.cpv = deviceJSON[i]['cpv'];
                    this.frig_devices.push(device);
                    await this.getDetailForDevice(i);
                }
            }
        } catch (err) {

        }
    }
    // Uses the Frigidaire API to fetch details for a given appliance
    async getDetailForDevice(deviceIndex) {
        const DETAILENDPOINT = '/elux-ms/appliances/latest'
        var urlDeviceString = "?pnc=" + this.frig_devices[deviceIndex].pnc + "&elc=" + this.frig_devices[deviceIndex].elc + "&sn=" + this.frig_devices[deviceIndex].serialNumber + "&mac=" + this.frig_devices[deviceIndex].mac + "&includeSubcomponents=true";
        var uri = DETAILENDPOINT + urlDeviceString

        try {
            const detailJSON = await this.getRequest(uri);
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

        }
    }   

    async getRequest(endpoint) {
        
        var url = APIURL + endpoint;
        var headers = {
            'x-ibm-client-id': this.clientId,
            'User-Agent': this.userAgent,
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + this.basicAuthToken
        }
   
        headers['session_token'] = this.sessionKey;
        try {
            const response = await superagent
                                .get(url)
                                .set(headers)
                                .disableTLSCerts();
            if (response.body.status == 'ERROR' && response.body.code != 'ECP0000') {
                 console.error("Frigidair Get Error: " + response.body.code + " " + response.body.message);
             } 
            else { 
                return (response.body.data);
            }
          } 
          catch (err) {
                console.error(err);
         }
    }

    async setPowerMode(deviceIndex, onValue){
        if (onValue) this.sendDeviceCommmand(deviceIndex,POWER_MODE,POWER_ON) 
        else this.sendDeviceCommmand(deviceIndex,POWER_MODE,POWER_OFF) 
    }

    async setFanSpeed(deviceIndex,speedValue){
        this.sendDeviceCommmand(deviceIndex,FAN_SPEED_SETTING, speedValue);
    }
    
    async setAirPurifier(deviceIndex,onValue){
        if (onValue) this.sendDeviceCommmand(deviceIndex,CLEAN_AIR_MODE,CLEANAIR_ON) 
        else this.sendDeviceCommmand(deviceIndex,CLEAN_AIR_MODE,CLEANAIR_OFF) 
    }
    async setChildLock(deviceIndex,onValue){
        if (onValue) this.sendDeviceCommmand(deviceIndex,CHILD_MODE,CHILDMODE_ON) 
        else this.sendDeviceCommmand(deviceIndex,CHILD_MODE,CHILDMODE_OFF) 
    }

    async sendDeviceCommmand(deviceIndex,attribute, value) {
       
        const POSTENDPOINT = APIURL + "/commander/remote/sendjson";

        var urlDeviceString = "?pnc=" + this.frig_devices[deviceIndex].pnc + "&elc=" + this.frig_devices[deviceIndex].elc + "&sn=" + this.frig_devices[deviceIndex].serialNumber + "&mac=" + this.frig_devices[deviceIndex].mac;
        var uri = POSTENDPOINT + urlDeviceString

        var headers = {
            'x-ibm-client-id': this.clientId,
            'User-Agent': this.userAgent,
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + this.basicAuthToken
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
   

        try {
            const response = await superagent
                                .post(uri)
                                .send(postBody)
                                .set(headers)
                                .disableTLSCerts();
            console.log(response.statusCode);
            if (response.statusCode != 200) {
                console.error("Frigidair post Error: " + response.body.code + " " + response.body.message);
            }
        }
          catch (err) {
                console.error(err);
         }
    }

    GenerateId () {
        return randomstring.generate({ length: 2, charset: 'hex' }).toLowerCase() + '-' +
            randomstring.generate({ length: 34, charset: 'hex' }).toLowerCase();
    }

    // Start for periodic refresh of devices
    startPollingProcess()
    {
        // Set time to refresh devices
     
    };

    async backgroundRefresh() {

       
    }
}

module.exports = Frigidaire;