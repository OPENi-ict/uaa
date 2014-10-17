var http = require('http');
var httpProxy = require('http-proxy');

var proxy = httpProxy.createProxyServer({target: 'http://localhost:8877'});

/*
proxy.on('proxyReq', function(proxyReq, req, res, options)
{
	console.log(req.method + ' ' + req.url);
	console.log(req.headers);
});
*/

proxy.on('proxyRes', function(proxyRes, req, res, options)
{
	//console.log(proxyRes.statusCode + ' ' + req.url);
	//console.log(proxyRes.headers);
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, PATCH, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, api_key, Authorization');
});

proxy.listen(8887);