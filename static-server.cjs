const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const mime = { 
  '.html': 'text/html; charset=utf-8', 
  '.js': 'application/javascript; charset=utf-8', 
  '.css': 'text/css; charset=utf-8', 
  '.json': 'application/json; charset=utf-8', 
  '.svg': 'image/svg+xml', 
  '.png': 'image/png' 
};

function createStaticServer(directory) {
  const root = fs.realpathSync(directory);
  const cache = new Map();
  const inside = file => file === root || file.startsWith(root + path.sep);
  return http.createServer((req,res)=>{
    const fail = (status,text)=>{res.writeHead(status,{'access-control-allow-origin':'*'});res.end(text);};
    if(!['GET','HEAD'].includes(req.method))return fail(405,'method not allowed');
    let urlPath;
    try {urlPath=decodeURIComponent((req.url || '/').split('?')[0]);}
    catch {return fail(400,'bad request');}
    if(urlPath === '/')urlPath='/index.html';
    const filePath=path.resolve(root,'.'+urlPath);
    if(!inside(filePath))return fail(403,'forbidden');
    try {
      // Retain bytes in memory, but never serve an old build after publish.
      const real=fs.realpathSync(filePath);
      if(!inside(real))return fail(403,'forbidden');
      const stat=fs.statSync(real);
      if(!stat.isFile())return fail(404,'not found');
      const signature=[stat.size,stat.mtimeMs,stat.ctimeMs].join(':');
      let entry=cache.get(filePath);
      if(!entry || entry.signature !== signature){
        entry={signature,data:fs.readFileSync(real)};cache.set(filePath,entry);
      }
      sendFile(res,filePath,req.method === 'HEAD' ? undefined : entry.data);
    }catch(error){
      cache.delete(filePath);
      fail(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500,'file unavailable');
    }
  });
}

function sendFile(res, filePath, data) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'content-type': mime[ext] || 'application/octet-stream',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'baggage, sentry-trace, content-type',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'close' // Close connection immediately for faster local response
  });
  res.end(data);
}

module.exports={createStaticServer};
if(require.main === module){
  const root=process.argv[2],port=Number(process.argv[3] || 8080);
  createStaticServer(root).listen(port,'127.0.0.1',()=>{
    console.log('Low-Latency static remnote bridge on 127.0.0.1:'+port);
  });
}
