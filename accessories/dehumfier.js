"use strict";
const FILTER_GOOD = 0;
const FILTER_CHANGE = 2;
const DEHMODE_DRY = 5;
const DEHMODE_AUTO = 6;
const DEHMODE_CONTINUOUS = 8;
const DEHMODE_QUIET = 9;
const CHILDMODE_OFF = 0
const CHILDMODE_ON = 1
const FANMODE_OFF = 0;
const FANMODE_LOW = 1;
const FANMODE_MED = 2;
const FANMODE_HIGH = 4;
const FANMODE_AUTO = 7;

const { HomeBridgeDehumidifierApplianceVersion } = require('../package.json');

class dehumidifierAppliance {
    constructor(frig, deviceIndex, device, config, log, Service, Characteristic, UUIDGen) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.name = device.name.trim();
    this.index = deviceIndex;
    this.dehumidifiermode = config.dehumidifierMode || DEHMODE_DRY;
    this.serialNumber = device.serialNumber
    this.firmware = device.firmwareVersion || HomeBridgeDehumidifierApplianceVersion;
    this.humidity = device.roomHumidity || 0;
    this.mode = device.mode || 0;
    this.childMode = device.childMode || 0;
    this.fanMode = device.fanMode || 0;
    this.targetHumidity = device.targetHumidity || 50;
    this.filterStatus = device.filterStatus || 0;
    this.deviceid = device.deviceId.toString();
    this.log = log;
    this.uuid = UUIDGen.generate(this.deviceid);
    this.frig = frig;
    this.frig.on(this.deviceid, this.refreshState.bind(this));
    this.VALID_CURRENT_STATE_VALUES = [Characteristic.CurrentHumidifierDehumidifierState.INACTIVE, Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING];
    this.VALID_TARGET_STATE_VALUES = [Characteristic.TargetHumidifierDehumidifierState.AUTO, Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER];
    this.HOMEKIT_TO_FANMODE = {
      0: FANMODE_LOW,
      1: FANMODE_LOW,
      2: FANMODE_MED,
      3: FANMODE_HIGH,
      4: FANMODE_HIGH
    };
    this.FAN_MODE_TO_HOMEKIT = {
      [FANMODE_OFF]: 0,
      [FANMODE_LOW]: 1,
      [FANMODE_MED]: 2,
      [FANMODE_HIGH]: 3,
      [FANMODE_AUTO]: 4
    };
  
  }

  refreshState(eventData)
  {
    this.log.debug(`Appppliance updated requested: ` , eventData);
    var dehumidifierService = this.accessory.getService(this.Service.AirPurifier);
    this.humidity = eventData.device.roomHumidity || 0;
    this.mode = eventData.device.mode || 0;
    this.childMode = eventData.device.childMode || 0;
    this.fanMode = eventData.device.fanMode || 0;
    this.targetHumidity = eventData.device.targetHumidity || 50;
    this.filterStatus = eventData.device.filterStatus;

    if (this.mode != 0) dehumidifierService.updateCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState,this.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING);
    else dehumidifierService.updateCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState,this.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);

    if (this.mode == DEHMODE_AUTO) dehumidifierService.updateCharacteristic(Characteristic.TargetHumidifierDehumidifierState,Characteristic.TargetHumidifierDehumidifierState.AUTO);
    else dehumidifierService.updateCharacteristic(Characteristic.TargetHumidifierDehumidifierState,Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);

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
    
    // Optional Characteristics
    dehumidifierService.getCharacteristic(this.Characteristic.WaterLevel)
      .on('get', async callback => this.getWaterLevel(callback));
       
    dehumidifierService.getCharacteristic(this.Characteristic.LockPhysicalControls)
       .on('get', async callback => this.getLockPhysicalControls(callback))
       .on('set', async (state, callback)  => this.setLockPhysicalControls(state, callback));

    dehumidifierService.getCharacteristic(this.Characteristic.RelativeHumidityDehumidifierThreshold)
        .setProps({
            minValue: 35,
            maxValue: 85,
            minStep: 5, 
        })
        .on('get', async callback => this.getRelativeHumidityDehumidifier(callback))
        .on('set', async (state, callback)  => this.setRelativeHumidityDehumidifier(state, callback));
 
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
    try{
      // Is the device currently on? If not turn on device
      if(this.mode == 0) responseDehum = await this.frig.setDevicePowerMode(deviceIndex,true);
      if (responseDehum > 0) {
        var dehumidifierService = this.accessory.getService(this.Service.HumidifierDehumidifier);
        dehumidifierService.updateCharacteristic(this.Characteristic.Active,this.Characteristic.Active.ACTIVE);
        return responseDehum = await this.frig.setDehumidifierAirPurifier(deviceIndex,mode);
      }
    } 
    catch (err)
    {
        this.log.error('Error encoutered activating air filter. ', err);
    }

  }
  // Handle requests to get the current value of the "Active" characteristic
  async getDehumidifierActive(callback) {
      var currentValue = this.Characteristic.Active.INACTIVE;
      if(this.mode != 0) currentValue = this.Characteristic.Active.ACTIVE;
      return callback(null, currentValue);
    }
  
  // Handle requests to set the "Active" characteristic
  async setDehumidifierActive(value, callback) {
      this.log('Triggered SET Dehumidifer Active:', value);
      var responseDehum = -1;
      try{
      
        if (value == this.Characteristic.Active.INACTIVE) responseDehum = await this.frig.setDevicePowerMode(this.index,false);
        else responseDehum = await this.frig.setDevicePowerMode(this.index,true);
        if (responseDehum < 0) this.log.error('Setting Dehumidifier Power Mode could not be completed.');
        else this.mode = responseDehum;
          
      }
      catch (err)
      {
          this.log.error('Setting Dehumidifier Power Mode encounter an error: ', err);
      }
      return callback(null);
    }

  // Handle requests to get the current value of the "Current Humidifier-Dehumidifier State" characteristic
  async getCurrentHumidifierDehumidifierState(callback) {
    var currentValue = this.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    if (this.mode != 0) currentValue = this.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING;
    return callback(null, currentValue);
  }

  // Handle requests to get the current value of the "Target Humidifier-Dehumidifier State" characteristic
  // Handle the dehumdififer mode
  async getTargetHumidifierDehumidifierState(callback) {
    var currentValue = this.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER;
    if (this.mode == DEHMODE_AUTO) currentValue = this.Characteristic.TargetHumidifierDehumidifierState.AUTO;
    return callback(null, currentValue);
  }

  // Handle requests to set the "Target Humidifier-Dehumidifier State" characteristic  
  // Handle the dehumdififer mode
  async setTargetHumidifierDehumidifierState(value, callback) {
    this.log('Triggered SET TargetHumidifierDehumidifierState:', value);
    var responseDehum = -1;
    try{
      
      if (value == this.Characteristic.TargetHumidifierDehumidifierState.AUTO)
        responseDehum = await this.frig.setDehumidifierMode(this.index,DEHMODE_AUTO);
      else if (value == this.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER) 
        responseDehum = await this.frig.setDehumidifierMode(this.index,this.dehumidifiermode);
      if (responseDehum < 0) this.log.error('Setting Dehumidifier Mode could not be completed.');
      else this.mode = responseDehum;
        
    }
    catch (err)
    {
        this.log.error('Setting Dehumidifier Mode encounter an error: ', err);
    }
    return callback(null);
  }

   // Handle requests to get the current value of the "RotationSpeed" characteristic
   async getRotationSpeed(callback) {
    // set this to a valid value for RotationSpeed
    return callback(null, this.FAN_MODE_TO_HOMEKIT[this.fanMode]);
  }

  // Handle requests to set the "Target Humidifier-Dehumidifier State" characteristic  
  async setRotationSpeed(value, callback) {
    this.log('Triggered SET RotationSpeed:', value);
    var responseDehum = -1;
    try{
      // Is the device currently on? If not turn on device
      if(this.mode == DEHMODE_DRY) {
        responseDehum = await this.frig.setDehumidifierRelativeHumidity(this.index,this.HOMEKIT_TO_FANMODE[value]);
        if (responseDehum < 0) this.log.error('Setting Dehumidifier Rotation Speed could not be completes.');
        else this.fanMode = responseDehum;
      } 
    }
    catch (err)
    {
        this.log.error('Setting Dehumidifier Rotation Speed encounter an error: ', err);
    }
    
    return callback(null);
  }

  // Handle requests to get the current value of the "LockPhysicalControls" characteristic
  async getLockPhysicalControls(callback) {
    var currentValue = this.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
    if(this.childMode != 0) currentValue = this.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED;
    return callback(null, currentValue);
  }

  // Handle requests to set the "LockPhysicalControls" characteristic  
  async setLockPhysicalControls(value, callback) {
    this.log('Triggered SET LockPhysicalControls:', value);
    var responseDehum = -1;
    try{
      // Is the device currently on? If not turn on device
      if(this.mode != 0) {
        if(value == this.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED) responseDehum = await this.frig.setDehumidifierChildLock(this.index,CHILDMODE_ON);
        else responseDehum = await this.frig.setDehumidifierChildLock(this.index,CHILDMODE_OFF);
        
        if (responseDehum < 0) this.log.error('Dehumidifier Child Lock encounter could not be completed.');
        else this.childMode = responseDehum;
          
      } 
    }
    catch (err)
    {
        this.log.error('Dehumidifier Child Lock encounter an error: ', err);
    }
    return callback(null);
  }

// Handle requests to get the current value of the "WaterLevel" characteristic
async getWaterLevel(callback) {
  this.log('Triggered GET getWaterLevel');
  const currentValue = 100;
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
    this.log('Triggered SET RelativeHumidityDehumidifie:', value);
    var responseDehum = -1;
    try{
      // Is the device currently on? If not turn on device
      if(this.mode == DEHMODE_DRY) {
        responseDehum = await this.frig.setDehumidifierRelativeHumidity(this.index,value);
        if (responseDehum < 0) this.log.error('Setting Dehumidifier Relative Humidity could not be complete.');
        else this.targetHumidity = responseDehum;
      } 
    }
    catch (err)
    {
        this.log.error('Setting Dehumidifier Relative Humidity encounter an error: ', err);
    }
    
    return callback(null);
  }

  async getFilterChangeIndication(callback){
    var currentValue = this.Characteristic.FilterChangeIndication.FILTER_OK;
    if ( this.filterStatus == FILTER_CHANGE) currentValue = this.Characteristic.FilterChangeIndication.CHANGE_FILTER;
    return callback(null, currentValue);
  }
  
}
module.exports = dehumidifierAppliance;