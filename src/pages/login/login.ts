import { Component,OnInit } from '@angular/core';
import { NavController,ToastController } from 'ionic-angular';
import {User} from "../../providers/user";
import {HttpClient} from "../../providers/http-client";
import {SmsCommand} from "../../providers/sms-command";
import {Synchronization} from "../../providers/synchronization";
import {AppProvider} from "../../providers/app-provider";
import {SqlLite} from "../../providers/sql-lite";
import {TabsPage} from "../tabs/tabs";

/*
 Generated class for the Login page.

 See http://ionicframework.com/docs/v2/components/#navigation for more info on
 Ionic pages and navigation.
 */
@Component({
  selector: 'page-login',
  templateUrl: 'login.html'
})
export class LoginPage implements OnInit{

  public loginData : any ={};
  public loadingData : boolean = false;
  public isLoginProcessActive :boolean = false;
  public loadingMessages : any = [];
  public logoUrl : string;

  //progress tracker object
  public progress : string = "0";
  public progressTracker : any;
  public completedTrackedProcess : any;
  public currentResourceType : string = "";
  //organisationUnit, entryForm,event
  constructor(public navCtrl: NavController,
              public synchronization:Synchronization,
              public toastCtrl: ToastController,public app : AppProvider,
              public SmsCommand : SmsCommand,
              public httpClient : HttpClient,
              public user : User,public sqlLite : SqlLite) {}

  ngOnInit() {
    this.logoUrl = 'assets/img/logo-2.png';
    this.completedTrackedProcess = [];
    this.user.getCurrentUser().then((user: any)=>{
      if(user){
        this.loginData = user
      }
      this.reInitiateProgressTrackerObject(this.loginData);
    });
  }


  reInitiateProgressTrackerObject(user){
    if(user.progressTracker && user.currentDatabase && user.progressTracker[user.currentDatabase]){
      this.progressTracker = user.progressTracker[user.currentDatabase];
      this.resetPassSteps();
    }else{
      this.loginData["progressTracker"] = {};
      this.progressTracker = {};
      this.progressTracker = this.getEmptyProgressTracker();
    }
  }

  resetPassSteps(){
    let dataBaseStructure =  this.sqlLite.getDataBaseStructure();
    this.progressTracker["communication"].passStepCount = 0;
    Object.keys(dataBaseStructure).forEach(key=>{
      let table = dataBaseStructure[key];
      if(table.canBeUpdated && table.resourceType){
        if(this.progressTracker[table.resourceType]){
          this.progressTracker[table.resourceType].passStepCount = 0;
          this.progressTracker[table.resourceType].passStep.forEach((passStep : any)=>{
            passStep.hasPassed = false;
          })
        }
      }
    });
  }

  getEmptyProgressTracker(){
    let dataBaseStructure =  this.sqlLite.getDataBaseStructure();
    let progressTracker = {};
    Object.keys(dataBaseStructure).forEach(key=>{
      let table = dataBaseStructure[key];
      if(table.canBeUpdated && table.resourceType){
        if(!progressTracker[table.resourceType]){
          progressTracker[table.resourceType] = {count : 1,passStep :[],passStepCount : 0};
        }else{
          progressTracker[table.resourceType].count += 1;
        }
      }
    });
    progressTracker["communication"] = {count : 3,passStep :[],passStepCount : 0};
    progressTracker["finalization"] = {count :0.5,passStep :[],passStepCount : 0};
    return progressTracker;
  }

  updateProgressTracker(resourceName){
    let dataBaseStructure =  this.sqlLite.getDataBaseStructure();
    let resourceType = "communication";
    if(dataBaseStructure[resourceName]){
      let table = dataBaseStructure[resourceName];
      if(table.canBeUpdated && table.resourceType){
        resourceType = table.resourceType
      }
    }

    if(this.progressTracker[resourceType].passStep.length == this.progressTracker[resourceType].count){
      this.progressTracker[resourceType].passStep.forEach((passStep:any)=>{
        if(passStep.name == resourceName && passStep.hasDownloaded){
          passStep.hasPassed = true;
        }
      });
    }else{
      this.progressTracker[resourceType].passStep.push({name : resourceName,hasDownloaded : true,hasPassed : true});
    }
    this.progressTracker[resourceType].passStepCount = this.progressTracker[resourceType].passStepCount + 1;
    this.loginData["progressTracker"][this.loginData.currentDatabase] = this.progressTracker;
    this.user.setCurrentUser(this.loginData).then(()=>{});
    this.completedTrackedProcess = this.getCompletedTrackedProcess();
    this.updateProgressBarPercentage();
  }

  updateProgressBarPercentage(){
    let total = 0; let completed = 0;
    Object.keys(this.progressTracker).forEach(key=>{
      let process = this.progressTracker[key];
      process.passStep.forEach((passStep : any)=>{
        if(passStep.name && passStep.hasPassed){
          completed = completed + 1;
        }
      });
      total += process.count;
    });
    let value = (completed/total) * 100;
    this.progress = value.toFixed(2);
  }

  getCompletedTrackedProcess(){
    let completedTrackedProcess = [];
    Object.keys(this.progressTracker).forEach(key=>{
      let process = this.progressTracker[key];
      process.passStep.forEach((passStep : any)=>{
        if(passStep.name && passStep.hasDownloaded){
          if(completedTrackedProcess.indexOf(passStep.name) == -1){
            completedTrackedProcess.push(passStep.name);
          }
        }
      });
    });
    return completedTrackedProcess;
  };

  login() {
    if (this.loginData.serverUrl) {
      if (!this.loginData.username) {
        this.setToasterMessage('Please Enter username');
      } else if (!this.loginData.password) {
        this.setToasterMessage('Please Enter password');
      } else {
        let resource = "Authenticating user";
        this.progress = "0";
        //empty communication as well as organisation unit
        this.progressTracker.communication.passStep = [];
        this.progressTracker.organisationUnit.passStep = [];
        this.currentResourceType = "communication";
        this.loadingData = true;
        this.isLoginProcessActive = true;
        this.app.getFormattedBaseUrl(this.loginData.serverUrl)
          .then(formattedBaseUrl => {
            this.loginData.serverUrl = formattedBaseUrl;
            this.user.authenticateUser(this.loginData).then((response:any)=> {
              response = this.getResponseData(response);
              this.loginData = response.user;
              //set authorization key and reset password
              this.loginData.authorizationKey = btoa(this.loginData.username + ':' + this.loginData.password);

              this.user.setUserData(JSON.parse(response.data)).then(userData=>{
                this.app.getDataBaseName(this.loginData.serverUrl).then(databaseName=>{
                  //update authenticate  process
                  this.loginData.currentDatabase = databaseName;
                  this.reInitiateProgressTrackerObject(this.loginData);
                  this.updateProgressTracker(resource);


                  resource = 'Opening database';
                  this.currentResourceType = "communication";
                  this.sqlLite.generateTables(databaseName).then(()=>{
                    this.updateProgressTracker(resource);
                    resource = 'Loading system information';
                    this.currentResourceType = "communication";
                    this.httpClient.get('/api/system/info',this.loginData).subscribe(
                      data => {
                        data = data.json();
                        this.updateProgressTracker(resource);
                        this.user.setCurrentUserSystemInformation(data).then(()=>{
                          this.downloadingOrganisationUnits(userData);
                        },error=>{
                          this.loadingData = false;
                          this.isLoginProcessActive = false;
                          this.setLoadingMessages('Fail to set system information');
                        });
                      },error=>{
                        this.loadingData = false;
                        this.isLoginProcessActive = false;
                        this.setLoadingMessages('Fail to load system information');
                      });

                  },error=>{
                    this.setToasterMessage('Fail to open database.');
                  })
                })
              });
            }, error=> {
              this.loadingData = false;
              this.isLoginProcessActive = false;
              if (error.status == 0) {
                this.setToasterMessage("Please check your network connection");
              } else if (error.status == 401) {
                this.setToasterMessage('You have enter wrong username or password');
              } else {
                this.setToasterMessage('Please check server url');
              }
            });
          });
      }
    } else {
      this.setToasterMessage('Please Enter server url');
    }
  }

  getResponseData(response){
    if(response.data.data){
      return this.getResponseData(response.data);
    }else{
      return response;
    }
  }

  downloadingOrganisationUnits(userData){
    let resource = 'organisationUnits';
    this.currentResourceType = "organisationUnit";
    let ids = [];
    userData.organisationUnits.forEach(organisationUnit=>{
      if(organisationUnit.id){
        ids.push(organisationUnit.id);
      }
    });
    let tableMetadata = this.sqlLite.getDataBaseStructure()[resource];
    let fields = tableMetadata.fields;
    this.app.downloadMetadataByResourceIds(this.loginData,resource,ids,fields,null).then(response=>{
      this.setLoadingMessages('Saving organisation data');
      this.app.saveMetadata(resource,response,this.loginData.currentDatabase).then(()=>{
        this.updateProgressTracker(resource);
        this.downloadingDataSets();
      },error=>{
        this.loadingData = false;
        this.isLoginProcessActive = false;
        this.setToasterMessage('Fail to save organisation data.');
      });
    },error=>{
      this.loadingData = false;
      this.isLoginProcessActive = false;
      this.setToasterMessage('Fail to download organisation data.');
    });
  }

  downloadingDataSets(){
    let resource = 'dataSets';
    this.currentResourceType = "entryForm";
    if(this.completedTrackedProcess.indexOf(resource) > -1){
      this.downloadingSections();
    }else{
      let tableMetadata = this.sqlLite.getDataBaseStructure()[resource];
      let fields = tableMetadata.fields;
      this.app.downloadMetadata(this.loginData,resource,null,fields,null).then(response=>{
        this.setLoadingMessages('Saving '+response[resource].length+' data entry form');
        this.app.saveMetadata(resource,response[resource],this.loginData.currentDatabase).then(()=>{
          this.updateProgressTracker(resource);
          this.downloadingSections();
        },error=>{
          this.loadingData = false;
          this.isLoginProcessActive = false;
          this.setToasterMessage('Fail to save data entry form.');
        });
      },error=>{
        this.loadingData = false;
        this.isLoginProcessActive = false;
        this.setToasterMessage('Fail to download data entry form.');
      });
    }
  }

  downloadingSections(){
    let resource = 'sections';
    this.currentResourceType = "entryForm";
    if(this.completedTrackedProcess.indexOf(resource) > -1){
      this.downloadingSmsCommand();
    }else{
      let tableMetadata = this.sqlLite.getDataBaseStructure()[resource];
      let fields = tableMetadata.fields;
      this.app.downloadMetadata(this.loginData,resource,null,fields,null).then(response=>{
        this.setLoadingMessages('Saving '+response[resource].length+' data entry form sections');
        this.app.saveMetadata(resource,response[resource],this.loginData.currentDatabase).then(()=>{
          this.updateProgressTracker(resource);
          this.downloadingSmsCommand();
        },error=>{
          this.loadingData = false;
          this.isLoginProcessActive = false;
          this.setToasterMessage('Fail to save data entry form sections.');
        });
      },error=>{
        this.loadingData = false;
        this.isLoginProcessActive = false;
        this.setToasterMessage('Fail to download data entry form sections.');
      });
    }
  }

  downloadingSmsCommand(){
    let resource = "smsCommand";
    this.currentResourceType = "entryForm";
    if(this.completedTrackedProcess.indexOf(resource) > -1){
      this.downloadingPrograms();
    }else{
      this.SmsCommand.getSmsCommandFromServer(this.loginData).then((response:any)=>{
        this.SmsCommand.savingSmsCommand(response,this.loginData.currentDatabase).then(()=>{
          this.updateProgressTracker(resource);
          this.downloadingPrograms();
        },error=>{
          this.loadingData = false;
          this.isLoginProcessActive = false;
          this.setToasterMessage('Fail to save metadata for send data via sms');
        });
      },(error:any)=>{
        this.loadingData = false;
        this.isLoginProcessActive = false;
        this.setToasterMessage('Fail to download metadata for send data via sms');
      });
    }
  }

  downloadingPrograms(){
    let resource = 'programs';
    this.currentResourceType = "event";
    if(this.completedTrackedProcess.indexOf(resource) > -1){
      this.downloadingProgramStageSections();
    }else{
      let tableMetadata = this.sqlLite.getDataBaseStructure()[resource];
      let fields = tableMetadata.fields;
      this.app.downloadMetadata(this.loginData,resource,null,fields,null).then(response=>{
        this.setLoadingMessages('Saving '+response[resource].length+' programs');
        this.app.saveMetadata(resource,response[resource],this.loginData.currentDatabase).then(()=>{
          this.updateProgressTracker(resource);
          this.downloadingProgramStageSections();
        },error=>{
          this.loadingData = false;
          this.isLoginProcessActive = false;
          this.setToasterMessage('Fail to save programs.');
        });
      },error=>{
        this.loadingData = false;
        this.isLoginProcessActive = false;
        this.setToasterMessage('Fail to download programs.');
      });
    }
  }

  downloadingProgramStageSections(){
    let resource = 'programStageSections';
    this.currentResourceType = "event";
    if(this.completedTrackedProcess.indexOf(resource) > -1){
      this.downloadingProgramStageDataElements();
    }else{
      let tableMetadata = this.sqlLite.getDataBaseStructure()[resource];
      let fields = tableMetadata.fields;
      this.app.downloadMetadata(this.loginData,resource,null,fields,null).then(response=>{
        this.setLoadingMessages('Saving '+response[resource].length+' program-stage sections');
        this.app.saveMetadata(resource,response[resource],this.loginData.currentDatabase).then(()=>{
          this.updateProgressTracker(resource);
          this.downloadingProgramStageDataElements();
        },error=>{
          this.loadingData = false;
          this.isLoginProcessActive = false;
          this.setToasterMessage('Fail to save program-stage sections.');
        });
      },error=>{
        this.loadingData = false;
        this.isLoginProcessActive = false;
        this.setToasterMessage('Fail to download program-stage sections.');
      });
    }
  }

  downloadingProgramStageDataElements(){
    let resource = 'programStageDataElements';
    this.currentResourceType = "event";
    if(this.completedTrackedProcess.indexOf(resource) > -1){
      this.downloadingIndicators();
      //this.setLandingPage();
    }else{
      let tableMetadata = this.sqlLite.getDataBaseStructure()[resource];
      let fields = tableMetadata.fields;
      this.app.downloadMetadata(this.loginData,resource,null,fields,null).then(response=>{
        this.setLoadingMessages('Saving '+response[resource].length+' program-stage data-elements');
        this.app.saveMetadata(resource,response[resource],this.loginData.currentDatabase).then(()=>{
          this.updateProgressTracker(resource);
          this.downloadingIndicators();
          //this.setLandingPage();
        },error=>{
          this.loadingData = false;
          this.isLoginProcessActive = false;
          this.setToasterMessage('Fail to save program-stage data-elements.');
        });
      },error=>{
        this.loadingData = false;
        this.isLoginProcessActive = false;
        this.setToasterMessage('Fail to download program-stage data-elements.');
      });
    }
  }

  downloadingIndicators(){
    let resource = 'indicators';
    this.currentResourceType = "report";
    if(this.completedTrackedProcess.indexOf(resource) > -1){
      this.downloadingReports();
    }else{
      let tableMetadata = this.sqlLite.getDataBaseStructure()[resource];
      let fields = tableMetadata.fields;
      this.app.downloadMetadata(this.loginData,resource,null,fields,null).then(response=>{
        this.setLoadingMessages('Saving '+response[resource].length+' indicators');
        this.app.saveMetadata(resource,response[resource],this.loginData.currentDatabase).then(()=>{
          this.updateProgressTracker(resource);
          this.downloadingReports();
        },error=>{
          this.loadingData = false;
          this.isLoginProcessActive = false;
          this.setToasterMessage('Fail to save indicators.');
        });
      },error=>{
        this.loadingData = false;
        this.isLoginProcessActive = false;
        this.setToasterMessage('Fail to download indicators.');
      });
    }
  }

  downloadingReports(){
    let resource = 'reports';
    this.currentResourceType = "report";
    if(this.completedTrackedProcess.indexOf(resource) > -1){
      this.downloadingConstants();
    }else{
      let tableMetadata = this.sqlLite.getDataBaseStructure()[resource];
      let fields = tableMetadata.fields;
      let filter = tableMetadata.filter;
      this.app.downloadMetadata(this.loginData,resource,null,fields,filter).then(response=>{
        this.setLoadingMessages('Saving '+response[resource].length+' reports');
        this.app.saveMetadata(resource,response[resource],this.loginData.currentDatabase).then(()=>{
          this.updateProgressTracker(resource);
          this.downloadingConstants();
        },error=>{
          this.loadingData = false;
          this.isLoginProcessActive = false;
          this.setToasterMessage('Fail to save reports.');
        });
      },error=>{
        this.loadingData = false;
        this.isLoginProcessActive = false;
        this.setToasterMessage('Fail to download reports.');
      });
    }
  }

  downloadingConstants(){
    let resource = 'constants';
    this.currentResourceType = "report";
    if(this.completedTrackedProcess.indexOf(resource) > -1){
      this.setLandingPage();
    }else{
      let tableMetadata = this.sqlLite.getDataBaseStructure()[resource];
      let fields = tableMetadata.fields;
      this.app.downloadMetadata(this.loginData,resource,null,fields,null).then(response=>{
        this.setLoadingMessages('Saving '+response[resource].length+' constants');
        this.app.saveMetadata(resource,response[resource],this.loginData.currentDatabase).then(()=>{
          this.updateProgressTracker(resource);
          this.setLandingPage();
        },error=>{
          this.loadingData = false;
          this.setToasterMessage('Fail to save constants.');
        });
      },error=>{
        this.loadingData = false;
        this.setToasterMessage('Fail to download constants.');
      });
    }
  }

  setLandingPage(){
    this.loginData.isLogin = true;
    this.loginData.password = "";
    this.user.setCurrentUser(this.loginData).then(()=>{
      this.synchronization.startSynchronization().then(()=>{
        this.navCtrl.setRoot(TabsPage);
        this.loadingData = false;
        this.isLoginProcessActive = false;
      });
    });
  }

  setLoadingMessages(message){
    this.loadingMessages.push(message);
  }

  setToasterMessage(message){
    let toast = this.toastCtrl.create({
      message: message,
      duration: 3000
    });
    toast.present();
  }

  setNotificationToasterMessage(message){
    let toast = this.toastCtrl.create({
      message: message,
      position : 'top',
      duration: 1500
    });
    toast.present();
  }

}
