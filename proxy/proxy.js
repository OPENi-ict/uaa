var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var util = require('util');

var httpProxy = require('http-proxy');
var connect = require('connect');
var bodyParser = require('body-parser');
var morgan  = require('morgan');
var rawBody = require('raw-body');
var typer = require('media-typer');

// --- PARAMS

var host = process.argv[2] || '0.0.0.0';
var port = parseInt(process.argv[3], 10) || 8887;
var targetHost = process.argv[4] || 'localhost';
var targetPort = parseInt(process.argv[5], 10) || 8877;

// --- REQUESTS

function loginRequest(user, pass, cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/login.do',
		port: targetPort,
		/*rejectUnauthorized: false,
		requestCert: true,
		agent: false,*/
		method: 'POST',
		headers: {'content-type': 'application/x-www-form-urlencoded'}
	},
	function(res)
	{
		cb((res.headers['set-cookie'] + '').match(/JSESSIONID\=(.*?)\;/)[1]);
	});
	req.write('username=' + user + '&password=' + pass);
	req.end();
}

function logoutRequest(session)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/logout.do',
		port: targetPort,
		method: 'GET',
		headers: {'cookie': 'JSESSIONID=' + encodeURIComponent(session)}
	},
	function(res)
	{

	});
	req.end();
}

function createUserRequest(token, cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/oauth/clients/moo',
		port: targetPort,
		method: 'POST',
		headers: {} //{'cookie': 'JSESSIONID=' + encodeURIComponent(session)}
	},
	function(res)
	{
		rawBody(res,
		{
			length: res.headers['content-length'],
			limit: '1mb' //,
			//encoding: typer.parse(res.headers['content-type']).parameters.charset
		},
		function (err, string)
		{
			if (err)
				return cb(err); //next(err)
			//req.text = string;
			//next();
			cb(string);
		});
	});
	req.end();
}

function authorizeRequest(session, client, scopes, cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/oauth/authorize?response_type=token&client_id=' + encodeURIComponent(client)  + '&scope=' + encodeURIComponent(scopes) + '&redirect_uri=localhost',
		port: targetPort,
		/*rejectUnauthorized: false,
		requestCert: true,
		agent: false,*/
		method: 'GET',
		headers: {'cookie': 'JSESSIONID=' + encodeURIComponent(session)}
	},
	function(res)
	{
		console.log(scopes);
		console.log(res.headers['location'] );
		var s = (res.headers['location'] + '').match(/access_token\=(.*?)\&/);
		if(s != null)
			s = s[1];
		cb(s);
	});
	req.end();
}

// --- PROXY MIDDLEWARE

var app = connect()
.use(bodyParser.urlencoded({ extended: false }))
.use(morgan('combined'))
.use(function(req, res, next)
{
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, PATCH, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, api_key, Authorization');
	res.setHeader('Connection', 'close');
	res.setHeader('Content-Type', 'application/json');
	next();
})
.use(function(req, res, next)
{
	if(req.method === 'OPTIONS')
	{
		res.writeHead(200);
		res.end();
		return;
	}
	next();
})
.use(bodyParser.json())
.use('/uaa/login', function(req, res, next)
{
	if(req.method === 'POST' && req.body['name'] !== undefined && req.body['password'] !== undefined)
	{
		loginRequest(req.body['name'], req.body['password'], function(session)
		{
			authorizeRequest(session, 'cf', 'openid', function(token)
			{
				if(token !== null)
				{
					res.writeHead(200);
					res.write('{"session":"' + session + '","token":"' + token + '"}');
					res.end();
				}
				else
				{
					res.writeHead(404);
					res.end();
				}
			});
		});
	}
	else
		next();
})
.use('/uaa/logout', function (req, res, next)
{
	if(req.method === 'POST' && req.body['session'] !== null)
	{
		logoutRequest(req.body['session']);
		res.writeHead(200);
		res.end();
		return;
	}
	else
		next();
})
.use('/uaa/oauth/authorize', function (req, res, next)
{
	if(req.method === 'POST' && req.body['session'] !== null && req.body['client'] !== null && req.body['scopes'] !== null)
	{
		authorizeRequest(req.body['session'], req.body['client'], req.body['scopes'], function(token)
		{
			if(token !== null)
			{
				res.writeHead(200);
				res.write('{"token":"' + token + '"}');
				res.end();
				return;
			}
			else
			{
				res.writeHead(404);
				res.end();
			}
		});
	}
	else
		next();
})
/*.use('/api/v1/uaa/Users', function (req, res, next)
{
	console.log(req.method);
	if(req.method === 'POST') // && req.body['session'] !== null
		createUserRequest(req.body['token'], function(token)
		{
			res.writeHead(200);
			res.write(token);
			res.end();
		});
	else
		next();
})*/
.use(function (error, req, res, next)
{
	if(error)
	{
		res.writeHead(406);
		res.write('');
		res.end();
	}
	else
	{
		res.writeHead(500);
		res.write('');
		res.end();
	}
});

http.createServer(app).listen(port, host, function()
{
	console.log('Running proxy at ' + host + ':' + port + ' for ' + targetHost + ':' + targetPort);
});
