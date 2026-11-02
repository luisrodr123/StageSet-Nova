// Let Windows choose a permitted ephemeral port; random ports can be reserved by Hyper-V on CI.
module.exports=()=>new Promise((resolve,reject)=>{const server=require('node:net').createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});
