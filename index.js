"use strict";
const frigengine = require('./frigidairmain');
const dehumidifierAppliance = require('./accessories/dehumfier');
const airpurifierAppliance = require('./accessories/airpurifier');

const PLUGIN_NAME = 'homebridge-frigidaire-dehumidifier';
const PLATFORM_NAME = 'FrigidaireAppliance';

const CLEAN_AIR_MODE = '1004';
const AIR_CONDITIONER = "AC1";
const DEHUMIDIFIER = "DH1";

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
  
  // Check if authentication information has been provided.
  try{
    if ((this.config.auth.username == "") || (this.config.auth.password == "") || (!this.config.auth.password) || (!this.config.auth.username))
    {
      this.log.error('Plug-in configuration error: Frigidaire Application authentication information not provided.');
      // terminate plug-in initization
      return;
    }
  }
  catch(err) {
    this.log.error('Plug-in configuration error: Frigidaire Application authentication information not provided.');
    // terminate plug-in initization
    return;
  }
  
  this.frig = new frigengine (log, this.config);
 
  // When this event is fired it means Homebridge has restored all cached accessories from disk.
  // Dynamic Platform plugins should only register new accessories after this event was fired,
  // in order to ensure they weren't added to homebridge already. This event can also be used
  // to start discovery of new accessories.
  api.on('didFinishLaunching', () => {

    this.initialLoad =  this.frig.init().then (() => {
       // Once devices are discovered update Homekit assessories
      this.refreshAccessories();
    }).catch(err => {
      this.log.error('Frigidaire Application Initization Failure:', err);
      // terminate plug-in initization
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
      // Confirm appliance is a dehumidifer
      if (currentDevice.destination == DEHUMIDIFIER) {
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
        // if clean air enabled create an air purifier tile to control functionality.
        if (this.config.enableAirFilter) {

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
      if (this.config.enableAirFilter) {
        // check for additional accessories that is link to this device.
          foundAccessory = this.frig.frig_devices.find(device => UUIDGen.generate(device.deviceId.toString()+ "-" + CLEAN_AIR_MODE) === accessory.UUID)
          if (!foundAccessory) 
            this.removeAccessory(accessory,true);
      }
      else
        this.removeAccessory(accessory,true);
    }
  }
}


//Add accessory to homekit dashboard
addAccessory(device) {

  this.log.info('Adding accessory');
      try {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [device.accessory]);
        this.accessories.push(device.accessory);
      } catch (err) {
          this.log.error(`An error occurred while adding accessory: ${err}`);
      }
}

//Remove accessory to homekit dashboard
removeAccessory(accessory, updateIndex) {
  this.log.info('Removing accessory:',accessory.displayName );
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
