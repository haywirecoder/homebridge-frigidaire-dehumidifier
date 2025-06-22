"use strict";
const TARGETHUM = 40;
 // Filter status
 const BUY = "BUY"
 const CHANGE = "CHANGE"
 const CLEAN = "CLEAN"
 const GOOD = "GOOD"
 
const DEHUMIDIFIER = "DH"; // GHDD5035W1, GHDD3035W1, FGAC5045W1
const DEHUMIDIFIERWITHPUMP = "Husky"; //FHDD5033W1, FHDD2233W1

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

const UI_ON = 'ON'
const UI_OFF = 'OFF'

const { HomeBridgeDehumidifierApplianceVersion } = require('../package.json');

class dehumidifierAppliance {
    constructor(frig, deviceIndex, device, config, log, Service, Characteristic, UUIDGen) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.name = device.name.trim();
    this.index = deviceIndex;
    // default mode when homeKit put appliance in DEHUMIDIFYING mode
    this.dehumidifiermode = config.dehumidifierMode || DRY; 
    this.serialNumber = device.serialNumber
    this.firmware = device.firmwareVersion || HomeBridgeDehumidifierApplianceVersion;
    this.humidity = device.roomHumidity || 0;
    this.mode = device.mode || POWER_OFF;
    this.uiMode = device.uiMode || UI_OFF;
    this.fanMode = device.fanMode || LOW;
    this.targetHumidity = device.targetHumidity || TARGETHUM;
    this.filterStatus = device.filterStatus || GOOD;
    this.waterBucketStatus = device.bucketStatus || 0;
    this.destination = device.destination || DEHUMIDIFIER;
    
    this.deviceId = device.deviceId.toString();
    this.log = log;
    this.uuid = UUIDGen.generate(this.deviceId);
    this.frig = frig;
    this.frig.on(this.deviceId, this.refreshState.bind(this));
    this.VALID_CURRENT_STATE_VALUES = [Characteristic.CurrentHumidifierDehumidifierState.INACTIVE, Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING];
    this.VALID_TARGET_STATE_VALUES = [Characteristic.TargetHumidifierDehumidifierState.AUTO, Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER];
    this.HOMEKIT_TO_FANMODE = {
      0: LOW,
      1: LOW,
      2: MEDIUM,
      3: HIGH,
      4: LOW
    };
    this.FAN_MODE_TO_HOMEKIT = {
      [LOW]: 0,
      [LOW]: 1,
      [MEDIUM]: 2,
      [HIGH]: 3,
      [LOW]: 4
    };
  
  }

  refreshState(eventData)
  {
    this.log.debug(`Appliance updated requested: ` , eventData);
    var dehumidifierService = this.accessory.getService(this.Service.HumidifierDehumidifier);
    this.humidity = eventData.device.roomHumidity || 0;
    this.mode = eventData.device.mode || POWER_OFF;
    this.uiMode = eventData.device.uiMode || UI_OFF;
    this.fanMode = eventData.device.fanMode || LOW;
    this.waterBucketStatus = eventData.device.bucketStatus || 0;
    this.targetHumidity = eventData.device.targetHumidity || TARGETHUM;
    this.filterStatus = eventData.device.filterStatus;

    if (this.mode != POWER_OFF){

      dehumidifierService.updateCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState,this.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING);
      if (this.mode == AUTO) dehumidifierService.updateCharacteristic(this.Characteristic.TargetHumidifierDehumidifierState,this.Characteristic.TargetHumidifierDehumidifierState.AUTO);
      else dehumidifierService.updateCharacteristic(this.Characteristic.TargetHumidifierDehumidifierState,this.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);
    
    }
    else
      dehumidifierService.updateCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState,this.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);

  }

  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Frigidaire')
        .setCharacteristic(this.Characteristic.Model, 'Dehumidifier')
        .setCharacteristic(this.Characteristic.FirmwareRevision, this.firmware)
        .setCharacteristic(this.Characteristic.SerialNumber, this.serialNumber);

    // create a new Humidifier Dehumidifier service
    var dehumidifierService = this.accessory.getService(this.Service.HumidifierDehumidifier);
    if(dehumidifierService == undefined) {
      dehumidifierService = this.accessory.addService(this.Service.HumidifierDehumidifier,this.name); 
      dehumidifierService.addCharacteristic(this.Characteristic.LockPhysicalControls);
      dehumidifierService.addCharacteristic(this.Characteristic.RelativeHumidityDehumidifierThreshold);
      dehumidifierService.addCharacteristic(this.Characteristic.WaterLevel);
    }  
    
    // create handlers for required characteristics
    dehumidifierService.getCharacteristic(this.Characteristic.Active)
      .on("get",  async callback => this.getDehumidifierActive(callback))
      .on('set', async (state, callback) => this.setDehumidifierActive(state, callback));   

    dehumidifierService.getCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState)
      .setProps({validValues: this.VALID_CURRENT_STATE_VALUES})
      .on("get",  async callback => this.getCurrentHumidifierDehumidifierState(callback));

    dehumidifierService.getCharacteristic(this.Characteristic.TargetHumidifierDehumidifierState)
    .setProps({validValues: this.VALID_TARGET_STATE_VALUES})
    .on("get",  async callback => this.getTargetHumidifierDehumidifierState(callback))
    .on('set', async (state, callback) => this.setTargetHumidifierDehumidifierState(state, callback)); 

    dehumidifierService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
       .on("get",  async callback => this.getCurrentRelativeHumidity(callback));
    
    dehumidifierService.getCharacteristic(this.Characteristic.RotationSpeed)
      .setProps({
          minValue: 0,
          maxValue: 4,
          minStep: 1,
      })
      .on("get",  async callback => this.getRotationSpeed(callback))
      .on('set', async (state, callback) => this.setRotationSpeed(state, callback)); 
    
    dehumidifierService.getCharacteristic(this.Characteristic.WaterLevel)
      .on('get', async callback => this.getWaterLevel(callback));
    
    dehumidifierService.getCharacteristic(this.Characteristic.RelativeHumidityDehumidifierThreshold)
        .setProps({
            minValue: 35,
            maxValue: 85,
            minStep: 1, 
        })
        .on('get', async callback => this.getRelativeHumidityDehumidifier(callback))
        .on('set', async (state, callback)  => this.setRelativeHumidityDehumidifier(state, callback));

    if (this.destination != DEHUMIDIFIERWITHPUMP) {
      dehumidifierService.getCharacteristic(this.Characteristic.LockPhysicalControls)
       .on('get', async callback => this.getLockPhysicalControls(callback))
       .on('set', async (state, callback)  => this.setLockPhysicalControls(state, callback));}

    // Create filter for notification
    var filterService = this.accessory.getService(this.Service.FilterMaintenance);
    if(filterService == undefined) filterService = this.accessory.addService(this.Service.FilterMaintenance, this.name + " Filter");
     // create handlers for required characteristics
     filterService.getCharacteristic(this.Characteristic.FilterChangeIndication)
      .on('get', async callback => this.getFilterChangeIndication(callback));

    dehumidifierService.addLinkedService(filterService);

  }
  // Handler to Air filter switch associated with this appliance.
  async dehumidifierAirFilterHandler(deviceIndex, mode) {
    var responseDehum = -1;
    var dehumidifierService = this.accessory.getService(this.Service.HumidifierDehumidifier);
    // Is the device currently on? If not turn on device
    if(this.mode == POWER_OFF) {
        responseDehum = await this.frig.setDevicePowerMode(deviceIndex,true);
        if (responseDehum >= 0) {
           this.mode = responseDehum; 
           dehumidifierService.updateCharacteristic(this.Characteristic.Active,this.Characteristic.Active.ACTIVE);
        }
    }
    // Confirm the device is now "on" and attempt active the device.
    responseDehum = -1;
    if (this.mode != POWER_OFF) responseDehum = await this.frig.setDehumidifierAirPurifier(deviceIndex,mode);
    return responseDehum;

  } 
   
  // Handle requests to get the current value of the "Active" characteristic
  async getDehumidifierActive(callback) {
      var currentValue = this.Characteristic.Active.INACTIVE;
      if(this.mode != POWER_OFF) currentValue = this.Characteristic.Active.ACTIVE;
      return callback(null, currentValue);
    }
  
  // Handle requests to set the "Active" characteristic
  async setDehumidifierActive(value, callback) {
      var responseDehum = -1;
      
      if (value == this.Characteristic.Active.INACTIVE) responseDehum = await this.frig.setDevicePowerMode(this.index,false);
      else responseDehum = await this.frig.setDevicePowerMode(this.index,true);
      if (responseDehum >= 0) this.mode = responseDehum;
    
      return callback(null);
    }

  // Handle requests to get the current value of the "Current Humidifier-Dehumidifier State" characteristic
  async getCurrentHumidifierDehumidifierState(callback) {
    var currentValue = this.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    if (this.mode != POWER_OFF) currentValue = this.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING;
    return callback(null, currentValue);
  }

  // Handle requests to get the current value of the "Target Humidifier-Dehumidifier State" characteristic
  // Handle the dehumdififer mode
  async getTargetHumidifierDehumidifierState(callback) {
    var currentValue = this.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER;
    if (this.mode == AUTO) currentValue = this.Characteristic.TargetHumidifierDehumidifierState.AUTO;
    return callback(null, currentValue);
  }

  // Handle requests to set the "Target Humidifier-Dehumidifier State" characteristic  
  // Handle the dehumdififer mode
  async setTargetHumidifierDehumidifierState(value, callback) {
    var responseDehum = -1;
  
    if (value == this.Characteristic.TargetHumidifierDehumidifierState.AUTO)
      responseDehum = await this.frig.setDehumidifierMode(this.index,AUTO);
    else if (value == this.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER) 
      responseDehum = await this.frig.setDehumidifierMode(this.index,this.dehumidifiermode);
    if (responseDehum >= 0) this.mode = responseDehum;
      
    return callback(null);
  }

   // Handle requests to get the current value of the "RotationSpeed" characteristic
   async getRotationSpeed(callback) {
    // set this to a valid value for RotationSpeed
    return callback(null, this.FAN_MODE_TO_HOMEKIT[this.fanMode]);
  }

  // Handle requests to set the "Target Humidifier-Dehumidifier State" characteristic  
  async setRotationSpeed(value, callback) {
    var responseDehum = -1;
    // Is the device currently on? If not turn on device
    if(this.mode == DRY) {
      responseDehum = await this.frig.setDehumidifierRelativeHumidity(this.index,this.HOMEKIT_TO_FANMODE[value]);
      if (responseDehum >= 0) this.fanMode = responseDehum;
    } 
    
    return callback(null);
  }

  // Handle requests to get the current value of the "LockPhysicalControls" characteristic
  async getLockPhysicalControls(callback) {
    var currentValue = this.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
    if(this.uiMode != 0) currentValue = this.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED;
    return callback(null, currentValue);
  }

  // Handle requests to set the "LockPhysicalControls" characteristic  
  async setLockPhysicalControls(value, callback) {
    var responseDehum = -1;
    // Is the device currently on? If not turn on device
    if(this.mode != POWER_OFF) {
      if(value == this.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED) responseDehum = await this.frig.setDehumidifierChildLock(this.index,UI_ON);
      else responseDehum = await this.frig.setDehumidifierChildLock(this.index,UI_OFF);

      if (responseDehum >= 0) this.uiMode = responseDehum;
        
    } 
    return callback(null);
  }

// Handle requests to get the current value of the "WaterLevel" characteristic
async getWaterLevel(callback) {
  var currentValue;
  // if bucket is full set to max value otherwise assume empty.
  if (this.waterBucketStatus == 0) currentValue = 0;
  else currentValue = 100;
  // set this to a valid value for water level
  return callback(null, currentValue);
}

  // Handle requests to get the current value of the "Current Relative Humidity" characteristic
  async getCurrentRelativeHumidity(callback) {
    // set this to a valid value for CurrentRelativeHumidity
    return callback(null, this.humidity);
  }

  async getRelativeHumidityDehumidifier (callback) {
    // Handle requests to get the current value of the "RelativeHumidityDehumidifier" characteristic
    return callback(null, this.targetHumidity);
  }

  // Handle requests to set the "RelativeHumidityDehumidifier" characteristic  
  async setRelativeHumidityDehumidifier(value, callback) {
    var responseDehum = -1;
    // Is the device currently on? If not turn on device
    if(this.mode == DRY) {
      responseDehum = await this.frig.setDehumidifierRelativeHumidity(this.index,value);
      if (responseDehum >= 35) this.targetHumidity = responseDehum;
    } 
    return callback(null);
  }

  async getFilterChangeIndication(callback){
    var currentValue = this.Characteristic.FilterChangeIndication.FILTER_OK;
    if ( this.filterStatus == CHANGE) currentValue = this.Characteristic.FilterChangeIndication.CHANGE_FILTER;
    return callback(null, currentValue);
  }
  
}
module.exports = dehumidifierAppliance;