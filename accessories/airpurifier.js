"use strict";

const CLEAN_AIR_MODE = '1004';
const CLEANAIR_ON = 1;
const CLEANAIR_OFF = 0;

const { HomeBridgeDehumidifierApplianceVersion } = require('../package.json');

class airPurifierAppliance {
    constructor(frig, deviceIndex, device, config, log, Service, Characteristic, UUIDGen, parentAccessory) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.name = device.name + " Air Purifier";
    this.index = deviceIndex;
    this.AirFilterMode = device.clearAirMode || 0;
    this.mode = device.mode ||0;
    this.log = log;
    this.parentAppliance = parentAccessory;
    this.serialNumber = device.serialNumber; 
    this.firmware = device.firmwareVersion || HomeBridgeDehumidifierApplianceVersion;
  
    this.deviceid = device.deviceId.toString() + "-" +CLEAN_AIR_MODE;
    this.frig = frig;
    this.frig.on(device.deviceId.toString(), this.refreshState.bind(this));
    this.uuid = UUIDGen.generate(this.deviceid);
    
  }

  refreshState(eventData)
  {
    this.log(`Appppliance updated requested: ` , eventData);
    var airPurifierService = this.accessory.getService(this.Service.AirPurifier);
    this.AirFilterMode = eventData.device.clearAirMode || 0;
    this.mode = eventData.device.mode || 0;
    // Update Characteristics to reflect new state.
    if ((this.AirFilterMode == 1) && (this.mode != 0)) {
      airPurifierService.updateCharacteristic(this.Characteristic.CurrentAirPurifierState,this.Characteristic.CurrentAirPurifierState.PURIFYING_AIR);
      airPurifierService.updateCharacteristic(this.Characteristic.TargetAirPurifierState,this.Characteristic.TargetAirPurifierState.AUTO);
    }
    else airPurifierService.updateCharacteristic(this.Characteristic.CurrentAirPurifierState,this.Characteristic.CurrentAirPurifierState.INACTIVE);
  }

  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Frigidaire')
        .setCharacteristic(this.Characteristic.Model, 'Dehumidifier Air Purifier')
        .setCharacteristic(this.Characteristic.FirmwareRevision, this.firmware)
        .setCharacteristic(this.Characteristic.SerialNumber, this.serialNumber);
    
     // create a new air purifier service
    var airPurifierService = this.accessory.getService(this.Service.AirPurifier);
    if(airPurifierService == undefined) airPurifierService = this.accessory.addService(this.Service.AirPurifier,this.name); 
    // create handlers for required characteristics
    airPurifierService.getCharacteristic(this.Characteristic.Active)
       .on('get', async callback => this.getAirActive(callback))
       .on('set', async (state,callback)  => this.setAirActive(state,callback));
  }
  
  // Handle requests to get the current value of the "Active" characteristic
  
  async getAirActive(callback) {
    var currentValue = this.Characteristic.Active.INACTIVE;
    var airPurifierService = this.accessory.getService(this.Service.AirPurifier);
    // set this to a valid value for Active only if air filter mode is on and main applicaince is on.
    if ((this.AirFilterMode == 1) && (this.mode != 0)) {
      airPurifierService.updateCharacteristic(this.Characteristic.CurrentAirPurifierState,this.Characteristic.CurrentAirPurifierState.PURIFYING_AIR);
      airPurifierService.updateCharacteristic(this.Characteristic.TargetAirPurifierState,this.Characteristic.TargetAirPurifierState.AUTO);
      currentValue = this.Characteristic.Active.ACTIVE;
    }
    else {
      airPurifierService.updateCharacteristic(this.Characteristic.CurrentAirPurifierState,this.Characteristic.CurrentAirPurifierState.INACTIVE);

    }

    return callback(null,currentValue);
  }

  // Handle requests to set the "Active" characteristic
   
  async setAirActive(value, callback) {
    var airPurifierService = this.accessory.getService(this.Service.AirPurifier);
    // Send message to parent device to activate.
    try {
        const returnActiveResp = await this.parentAppliance.dehumidifierAirFilterHandler(this.index,value);
        if (returnActiveResp > 0) {
          // Set filter state information
          if (value == this.Characteristic.CurrentAirPurifierState.ACTIVE ) {
            airPurifierService.updateCharacteristic(this.Characteristic.CurrentAirPurifierState,this.Characteristic.CurrentAirPurifierState.PURIFYING_AIR);
            airPurifierService.updateCharacteristic(this.Characteristic.TargetAirPurifierState,this.Characteristic.TargetAirPurifierState.AUTO);
          }
          else 
            airPurifierService.updateCharacteristic(this.Characteristic.CurrentAirPurifierState,this.Characteristic.CurrentAirPurifierState.INACTIVE);
          this.AirFilterMode = returnActiveResp;
        }
      } catch(e) {
        
        this.log.error('Dehumidifier Air Filter encounter an error: ', err);

      }
    return callback(null);
  }

}
module.exports = airPurifierAppliance;