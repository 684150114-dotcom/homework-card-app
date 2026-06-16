@echo off
echo ========================================
echo   Homework Card App - Local Server
echo ========================================
echo.
echo Starting server at http://localhost:3000
echo Press Ctrl+C to stop the server
echo.
node -e "const http=require('http'),fs=require('fs'),path=require('path'),url=require('url');const PORT=3000;const MIME={'html':'text/html','css':'text/css','js':'application/javascript','json':'application/json','png':'image/png','jpg':'image/jpeg','svg':'image/svg+xml','ico':'image/x-icon'};http.createServer((req,res)=>{let p=url.parse(req.url).pathname;if(p==='/')p='/index.html';const fp=path.join(__dirname,p);if(!fs.existsSync(fp)){res.writeHead(404);res.end('Not found');return;}const ext=path.extname(fp).slice(1);res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(fp).pipe(res);}).listen(PORT,()=>{console.log('Server running at http://localhost:'+PORT);require('child_process').exec('start http://localhost:'+PORT)});"
