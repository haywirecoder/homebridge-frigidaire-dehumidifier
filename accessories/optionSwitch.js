"use strict";

const DEHUMIDIFIER = "DH"; // FGAC5045W1
const DEHUMIDIFIER_HUSKY = "Husky"; //FHDD5033W1

const PUMP_ON = 'ON'
const PUMP_OFF = 'OFF'
const PUMP_NOT_PRESENT = 'NA'

const { HomeBridgeDehumidifierApplianceVersion } = require('../package.json');

class dehumidifierApplianceOptionsSwitch { 

    constructor(frig, deviceIndex, device, config, log, Service, Characteristic, UUIDGen){
      this.Characteristic = Characteristic;
      this.Service = Service;
      this.name = device.name.trim();
      this.index = deviceIndex;
      this.switchType = config.switchType;
      // default mode when homeKit put appliance in DEHUMIDIFYING mode
      this.serialNumber = device.serialNumber
      this.firmware = device.firmwareVersion || HomeBridgeDehumidifierApplianceVersion;
      this.destination = device.destination || DEHUMIDIFIER;
      this.pumpStatus = device.pumpStatus || PUMP_NOT_PRESENT;
      this.deviceId = device.deviceId.toString();
      this.log = log;
      this.uuid = UUIDGen.generate(this.deviceId + "_" + this.switchType);
      this.frig = frig;
      this.frig.on(this.deviceId, this.refreshState.bind(this));

   
  }

  refreshState(eventData)
  {
    this.log.debug(`Switch updated requested: ` , eventData);
    this.pumpStatus = eventData.pumpStatus || this.pumpStatus;

  }
 
  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Frigidaire')
        .setCharacteristic(this.Characteristic.Model, 'Dehumidifier')
  
    switch (this.switchType) {
      case 'pumpswitch':
        this.log(`Adding Pump Switch for ${this.name}`);
        var pumpSwitch = this.accessory.getService(this.Service.Switch);
        if(pumpSwitch == undefined) pumpSwitch = this.accessory.addService(this.Service.Switch,this.name + ' Pump'); 
        
        pumpSwitch.setCharacteristic(this.Characteristic.Name, this.name + ' Pump');
        pumpSwitch.setCharacteristic(this.Characteristic.On, false);
        pumpSwitch.getCharacteristic(this.Characteristic.On)
                  .on('get', async callback => this.getPumpSwitch(callback))
                  .on('set', async (state, callback) => this.setPumpSwitch(state, callback));   
      break;
    }

  }

  async getPumpSwitch (callback) {
    // Handle requests to get the current value 
    // set this to a valid value for On
    var currentValue = true;
    if ((this.pumpStatus == PUMP_OFF) || (this.pumpStatus == PUMP_NOT_PRESENT)) {
      this.log.debug("Condenstate Pump switch is not running or not present.");
      currentValue = false
    }
    else this.log.debug("Condenstate Pump Switch is running");
    return callback(null, currentValue);
  }

  // Handle requests to set the "Pump" characteristic
  async setPumpSwitch(value, callback) {
   var responseDehum = -1;
    // Is the device currently on? If not turn on device
    if((this.applianceState != POWER_OFF) && (this.pumpStatus != PUMP_NOT_PRESENT)) {
      if(value == this.Characteristic.On) responseDehum = await this.frig.setDehumidifierCondenstationPump(this.index,PUMP_ON);
      else responseDehum = await this.frig.setDehumidifierCondenstationPump(this.index,PUMP_OFF);

       if (responseDehum >= 0) this.pumpStatus = responseDehum;
        
    } 
    return callback(null);
  }
 
}

module.exports = dehumidifierApplianceOptionsSwitch;