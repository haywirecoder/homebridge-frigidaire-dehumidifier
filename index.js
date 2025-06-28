"use strict";
const frigengine = require('./frigidairmain');
const dehumidifierAppliance = require('./accessories/dehumfier');
const airpurifierAppliance = require('./accessories/airpurifier');
const optionswitch = require('./accessories/optionSwitch');


const PLUGIN_NAME = 'homebridge-frigidaire-dehumidifier';
const PLATFORM_NAME = 'FrigidaireAppliance';

const CLEAN_AIR_MODE = '1004';
const CLEANAIR_NOT_PRESENT = 'NA';

const DEHUMIDIFIER = "DH"; // FGAC5045W1
const DEHUMIDIFIER_HUSKY = "Husky"; //FHDD5033W1

var Service, Characteristic, HomebridgeAPI, UUIDGen;

module.exports = function(homebridge) {

  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HomebridgeAPI = homebridge;
  UUIDGen = homebridge.hap.uuid;
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, FrigidaireAppliancePlatform);
}


class FrigidaireAppliancePlatform {
  constructor(log, config, api) {
  this.log = log;
  this.api = api;
  this.name = config.name;
  this.config = config;
  this.accessories = [];
  this.frigExtraAccessories = [];
  this.persistPath = undefined;
    
  
  // Check if authentication information has been provided.
  try{
    if ((this.config.auth.username == "") || (this.config.auth.password == "") || (!this.config.auth.password) || (!this.config.auth.username))
    {
      this.log.error('Plug-in configuration error: Frigidaire Application authentication information not provided.');
      // terminate plug-in initialization
      return;
    }
  }
  catch(err) {
    this.log.error('Plug-in configuration error: Frigidaire Application authentication information not provided.');
    // terminate plug-in initialization
    return;
  
  }

  // Determine if purifiers should be enabled
  this.enableAirPurifier  = this.config.enableAirPurifier ?? true;

  // Determine if pump switch should be enabled
  this.enablePumpSwitch = this.config.enablePumpSwitch ?? true;

  // Homebridge storage folder for local storage of access and refresh token
  this.persistPath = api.user.persistPath();

  // Create new frigidaire device retrival object
  this.frig = new frigengine (log, this.config, this.persistPath);
 
  // When this event is fired it means Homebridge has restored all cached accessories from disk.
  // Dynamic Platform plugins should only register new accessories after this event was fired,
  // in order to ensure they weren't added to homebridge already. This event can also be used
  // to start discovery of new accessories.
  api.on('didFinishLaunching', () => {

    this.initialLoad =  this.frig.init().then (() => {
       // Once devices are discovered update Homekit accessories
      this.refreshAccessories();
    }).catch(err => {
      this.log.error('Frigidaire Application initialization Failure:', err);
      // terminate plug-in initialization
      return;
    });
    
  });
  }
  
  // Create associates in Homekit based on devices in Frigidaire Appliance account
  async refreshAccessories() {
  
    // Track number of device added to homekit
    var homekit_appliance_count = 0;

    // Process each flo devices and create accessories within the platform.
    if(this.frig.frig_devices.length <= 0) return;
    // Process each appliance 
    for (var i = 0; i < this.frig.frig_devices.length; i++) {

      let currentDevice = this.frig.frig_devices[i];
      this.log.debug(this.frig.frig_devices[i]);
      // Confirm appliance is a dehumidifier
      if ((currentDevice.destination == DEHUMIDIFIER) || (currentDevice.destination == DEHUMIDIFIER_HUSKY)){
        this.log(`Configuring ${currentDevice.name} with a Device ID: ${currentDevice.deviceId}`);
        let deviceAccessory = new dehumidifierAppliance(this.frig, i, currentDevice, this.config, this.log, Service, Characteristic, UUIDGen);
        // check the accessory was not restored from cache
        let foundAccessory = this.accessories.find(accessory => accessory.UUID === deviceAccessory.uuid)
        if (!foundAccessory) {
          // create a new accessory
          let newAccessory = new this.api.platformAccessory(deviceAccessory.name, deviceAccessory.uuid);
          // add services and Characteristic
          deviceAccessory.setAccessory(newAccessory);
          // register the accessory
          this.addAccessory(deviceAccessory); 
        }
        else {// accessory already exist just set characteristic
            deviceAccessory.setAccessory(foundAccessory);
        }
        if((currentDevice.destination == DEHUMIDIFIER_HUSKY) && (this.enablePumpSwitch)) {
              this.config.switchType = "pumpswitch";
              var pumpswitch = new optionswitch(this.frig, i, currentDevice, this.config, this.log, Service, Characteristic, UUIDGen);
              // check the accessory was not restored from cache
              foundAccessory = this.accessories.find(accessory => accessory.UUID === pumpswitch.uuid)
              this.log(pumpswitch.switchType);
              if (!foundAccessory) {
                // create a new accessory
                let newAccessory = new this.api.platformAccessory(currentDevice.name + " Pump", pumpswitch.uuid);
                // add services and Characteristic
                pumpswitch.setAccessory(newAccessory);
                // register the accessory
                this.addAccessory(pumpswitch);
              }
              else // accessory already exist just set characteristic
                pumpswitch.setAccessory(foundAccessory);
              this.frigExtraAccessories.push(pumpswitch);
              this.log.info(`Pump Switch Enabled for ${currentDevice.name}`);
        }
        // if clean air enabled create an air purifier tile to control functionality.
        if ((this.enableAirPurifier) && (currentDevice.destination == DEHUMIDIFIER) && (currentDevice.cleanAirMode != CLEANAIR_NOT_PRESENT)) {

            let deviceAccessoryAir = new airpurifierAppliance(this.frig, i, currentDevice, this.config, this.log, Service, Characteristic, UUIDGen, deviceAccessory);
            // check the accessory was not restored from cache
            let foundAccessory = this.accessories.find(accessory => accessory.UUID === deviceAccessoryAir.uuid)
            if (!foundAccessory) {
              // create a new accessory
              let newAccessory = new this.api.platformAccessory(deviceAccessoryAir.name, deviceAccessoryAir.uuid);
              // add services and Characteristic
              deviceAccessoryAir.setAccessory(newAccessory);
              // register the accessory
              this.addAccessory(deviceAccessoryAir); 
            }
            else {// accessory already exist just set characteristic
              deviceAccessoryAir.setAccessory(foundAccessory);
            }
            this.frigExtraAccessories.push(pumpswitch);
        }
        homekit_appliance_count += 1;
      }
    }
    this.log.info(`Frigidaire Appliance configured: ${homekit_appliance_count}`);

    // Clean accessories with no association with Flo devices.
    this.orphanAccessory();
    //Start background process to poll devices, if any devices were present
    if (homekit_appliance_count != 0) {
      this.log.info(`Frigidaire background update process started. Appliance status will be check each ${Math.floor((this.config.deviceRefresh / 60))} min(s) ${Math.floor((this.config.deviceRefresh % 60))} second(s).`);              
      this.frig.startPollingProcess();     
    }
};

// Find accessory with no association with frigidaire appliances and remove
async orphanAccessory() {
  var cachedAccessory = this.accessories;
  var foundAccessory;

  for (var i = 0; i < cachedAccessory.length; i++) 
  {   
    let accessory = cachedAccessory[i];
    // determine if accessory is currently a device in frigidaire account, thus should remain
    foundAccessory = this.frig.frig_devices.find(device => UUIDGen.generate(device.deviceId.toString()) === accessory.UUID)
    if (!foundAccessory) {
        foundAccessory = this.frigExtraAccessories.find(frigExtraAccessories => frigExtraAccessories.uuid === accessory.UUID);
        if (!foundAccessory) { 
            this.removeAccessory(accessory,false);
        }
      }
    }
  }

//Add accessory to homekit dashboard
addAccessory(device) {

  this.log.debug('Adding accessory');
      try {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [device.accessory]);
        this.accessories.push(device.accessory);
      } catch (err) {
          this.log.error(`An error occurred while adding accessory: ${err}`);
      }
}

//Remove accessory to homekit dashboard
removeAccessory(accessory, updateIndex) {
  this.log.info('Removing accessory from cache:',accessory.displayName );
    if (accessory) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
    if (updateIndex) {
      if (this.accessories.indexOf(accessory) > -1) {
          this.accessories.splice(this.accessories.indexOf(accessory), 1);
    }}
  }

  // This function is invoked when homebridge restores cached accessories from disk at startup.
  // It should be used to setup event handlers for characteristics and update respective values.
  configureAccessory(accessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  } 

}
