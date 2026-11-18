const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function boot(projectId='production-example', hostname='example.test') {
 const calls=[];
 const auth={setPersistence:()=>Promise.resolve(),useEmulator:()=>calls.push('auth-emulator')};
 const db={useEmulator:()=>calls.push('db-emulator')};
 const firebase={apps:[],initializeApp:()=>({}),auth:()=>{calls.push('auth');return auth;},firestore:()=>{calls.push('db');return db;}};
 firebase.auth.Auth={Persistence:{SESSION:'session',LOCAL:'local'}};
 const context={window:{CLASSCARE_CONFIG:{firebase:{apiKey:'synthetic-key',projectId}}},firebase,location:{hostname},console:{error(){}},Set,queueMicrotask};
 vm.runInNewContext(fs.readFileSync('config/firebase-config.js','utf8'),context);
 return {calls,services:context.window.ClassCare.getFirebase(),api:context.window.ClassCare};
}
test('Firebase initializes correctly without App Check',()=>{
 const {calls,services}=boot();
 assert.ok(services);
 assert.deepEqual(calls,['auth','db']);
});

test('secondary registration and provisioning services use emulators exactly once',()=>{
 const {api}=boot('demo-classcare','localhost');
 const calls=[];
 const auth={useEmulator:url=>calls.push(url)};
 const db={useEmulator:(host,port)=>calls.push(`${host}:${port}`)};
 api.configureLocalEmulators(auth,db);
 api.configureLocalEmulators(auth,db);
 assert.deepEqual(calls,['http://127.0.0.1:9099','127.0.0.1:8080']);
});
test('only local demo uses emulators; standard project initializes production services',()=>{
 assert.deepEqual(boot('demo-classcare','localhost').calls,['auth','db','auth-emulator','db-emulator']);
 assert.deepEqual(boot('real-project','classcare.web.app').calls,['auth','db']);
});
