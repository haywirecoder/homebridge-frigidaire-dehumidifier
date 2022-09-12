"use strict";

const CLEAN_AIR_MODE = '1004';

class airPurifierAppliance {
    constructor(frig, device, config, log, Service, Characteristic, UUIDGen, parentAccessory) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.name = device.name + " Air Purifier";
    this.AirFilterMode = device.clearAirMode || 0;
    this.mode = device.mode ||0;
    this.log = log;
    this.parentAppliance = parentAccessory;
    this.serialNumber = device.serialNumber;
    this.firmware = device.firmwareVersion;
    this.deviceid = device.deviceId.toString() + "-" +CLEAN_AIR_MODE;
    this.frig = frig;
    this.frig.on(this.deviceid, this.refreshState.bind(this));
    this.uuid = UUIDGen.generate(this.deviceid);
    
  }

  refreshState(eventData)
  {
    this.log.debug(`Appppliance updated requested: ` , eventData);

  }

  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Frigidaire')
        .setCharacteristic(this.Characteristic.Model, 'Dehumidifier Air Purifier')
        .setCharacteristic(this.Characteristic.FirmwareRevision, this.version)
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
    this.log('Triggered GET AirActive');
    var currentValue = this.Characteristic.Active.INACTIVE;
    // set this to a valid value for Active only if air filter mode is on and main applicaince is on.
    if ((this.AirFilterMode == 1) && (this.mode != 0)) currentValue = this.Characteristic.Active.ACTIVE;

    return callback(null,currentValue);
  }

  // Handle requests to set the "Active" characteristic
   
  async setAirActive(value, callback) {
    this.log('Triggered SET AirActive', value);
   
    var airPurifierService = this.accessory.getService(this.Service.AirPurifier);

    // var airPurifierService = this.accessory.getService(this.Service.AirPurifier);
    // if (this.mode != 0) {
    //   // Execute codes
      
    // } else {
    //   this.log.warn('The main appliance must be ON first. Please turn ON the main appliance before activating air purifier.');
    //   setTimeout(function () {airPurifierService.updateCharacteristic(this.Characteristic.Active,this.Characteristic.Active.INACTIVE)}.bind(this),1000);
    // }
    if (value == this.Characteristic.Active.ACTIVE) {
      // Send message to parent device to activate.
      var dehumidifierService = this.parentAppliance.accessory.getService(this.Service.HumidifierDehumidifier);
      dehumidifierService.updateCharacteristic(this.Characteristic.Active,this.Characteristic.Active.ACTIVE);

      // Set filter state information
      airPurifierService.updateCharacteristic(this.Characteristic.CurrentAirPurifierState,this.Characteristic.CurrentAirPurifierState.PURIFYING_AIR);
      airPurifierService.updateCharacteristic(this.Characteristic.TargetAirPurifierState,this.Characteristic.TargetAirPurifierState.AUTO);
    }
    else {
      airPurifierService.updateCharacteristic(this.Characteristic.CurrentAirPurifierState,this.Characteristic.CurrentAirPurifierState.INACTIVE);
    } 
    return callback(null);
  }

}
module.exports = airPurifierAppliance;