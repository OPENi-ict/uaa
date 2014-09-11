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
		method: 'POST',
		headers: {'content-type': 'application/x-www-form-urlencoded'}
	},
	function(res)
	{
		if(res.headers['location'].indexOf('error') < 0)
			return cb(res.statusCode, (res.headers['set-cookie'] + '').match(/JSESSIONID\=(.*?)\;/)[1]);
		cb(400);
	});
	req.write('username=' + user + '&password=' + pass);
	req.end();
}

function logoutRequest(session, cb)
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
		if(cb)
			cb(res.statusCode)
	});
	req.end();
}

function getAdminToken(cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/oauth/token',
		port: targetPort,
		method: 'POST',
		headers:
		{
			'Content-Type': 'application/x-www-form-urlencoded',
			//'Authorization': 'Basic Y2Y6ZmIyMGM0N2JmZmViY2E2Mw=='
			//'Authorization': 'Basic YWRtaW46ZmIyMGM0N2JmZmViY2E2Mw=='
			'Authorization': 'Basic b3Blbmk6ZmIyMGM0N2JmZmViY2E2Mw=='
		}
	},
	function(res)
	{
		rawBody(res,
		{
			length: res.headers['content-length'],
			limit: '1mb'
		},
		function (err, string)
		{
			if (err)
				return cb(res.statusCode);
			cb(res.statusCode, JSON.parse(string));
		});
	});
	//req.write('username=root&password=fb20c47bffebca63&client_id=cf&grant_type=password');
	//req.write('username=root&password=fb20c47bffebca63&client_id=admin&grant_type=password');
	req.write('username=root&password=fb20c47bffebca63&client_id=openi&grant_type=password');
	req.end();
}

function createUserRequest(token, username, password, cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/Users',
		port: targetPort,
		method: 'POST',
		headers:
		{
			'Content-Type': 'application/json',
			'Authorization': 'Bearer ' + token
		} 
	},
	function(res)
	{
		rawBody(res,
		{
			length: res.headers['content-length'],
			limit: '1mb'
		},
		function (err, string)
		{
			if (err)
				return cb(res.statusCode);
			cb(res.statusCode, string);
		});
	});
	req.write('{"schemas":["urn:scim:schemas:core:1.0"],"password":"' + password + '","emails":[{"value":"email@example.org"}],"userName":"' + username + '"}');
	req.end();
}

function createClientRequest(token, client_id, cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/oauth/clients', // + client_id,
		port: targetPort,
		method: 'POST',
		headers:
		{
			'Content-Type': 'application/json',
			'Authorization': 'Bearer ' + token
		} 
	},
	function(res)
	{
		rawBody(res,
		{
			length: res.headers['content-length'],
			limit: '1mb'//,
			//encoding: typer.parse(res.headers['content-type']).parameters.charset
		},
		function (err, string)
		{
			if (err)
				return cb(res.statusCode);
			cb(res.statusCode, JSON.stringify(string.toString()));
		});
	});
	//req.write('{"client_id":"' + client_id + '","client_secret":"fb20c47bffebca63","scope":["uaa.none"],"resource_ids":["none"],"authorities":["openid"],"authorized_grant_types" : ["authorization_code","client_credentials","password","refresh_token"], "access_token_validity": 43200}');
	req.write('{"client_id":"' + client_id + '","scope":["openid"],"resource_ids":["none"],"authorities":["openid"],"authorized_grant_types":["implicit","password","refresh_token"],"autoapprove":"true"}');
	req.end();
}

function authorizeRequest(session, client_id, cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/oauth/authorize?response_type=token&client_id=' + encodeURIComponent(client_id)  + '&scope=openid&redirect_uri=localhost',
		port: targetPort,
		method: 'GET',
		headers: {'cookie': 'JSESSIONID=' + encodeURIComponent(session)}
	},
	function(res)
	{
		console.log(res.statusCode);
		console.log(res.headers);
		var s = (res.headers['location'] + '').match(/access_token\=(.*?)\&/);
		if(s != null)
			s = s[1];
		cb(res.statusCode, s);
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
.use('/uaa/session', function(req, res, next)
{
	if(req.method === 'POST' && req.body['name'] != undefined && req.body['password'] != undefined)
	{
		loginRequest(req.body['name'], req.body['password'], function(statusCode, session)
		{
			if(session != null)
			{
				res.writeHead(200);
				res.write('{"session":"' + session + '"}');
				res.end();
			}
			else
			{
				res.writeHead(400);
				res.end();
			}
		});
	}
	else if(req.method === 'DELETE' && req.body['session'] != null)
	{
		logoutRequest(req.body['session']);
		{
			res.writeHead(200);
			res.end();
			return;
		}
	}
	else
		next();
})
.use('/uaa/authorize', function (req, res, next)
{
	if(req.method === 'POST' && req.body['session'] != null && req.body['client_id'] != null)
	{
		authorizeRequest(req.body['session'], req.body['client_id'], function(statusCode, token)
		{
			if(token != null)
			{
				res.writeHead(200);
				res.write('{"token":"' + token + '"}');
				res.end();
				return;
			}
			else
			{
				res.writeHead(400);
				res.end();
			}
		});
	}
	else
		next();
})
.use('/uaa/users', function (req, res, next)
{
	if(req.method === 'POST' &&  req.body['name'] != null && req.body['password'] != null)
	{
		getAdminToken(function(statusCode, token)
		{
			createUserRequest(token.access_token, req.body['name'], req.body['password'], function(statusCode, body)
			{
				if(statusCode == 201)
				{
					res.writeHead(200);
					res.end();
				}
				else
				{
					res.writeHead(400);
					res.end();
				}
			});
		});
	}
	else
		next();
})
.use('/uaa/clients', function (req, res, next)
{
	console.log(req.body);
	if(req.method === 'POST' && req.body['client_id'] != null)
	{
		getAdminToken(function(statusCode, token)
		{
			console.log(token);
			createClientRequest(token.access_token, req.body['client_id'], function(statusCode, body)
			{
				if(statusCode == 201)
				{
					res.writeHead(200);
					res.end();
				}
				else
				{
					res.writeHead(400);
					res.end();
				}
			});
		});
	}
	else
		next();
})
.use(function (error, req, res, next)
{
	if(error)
	{
		res.writeHead(406);
		res.end();
	}
	else
	{
		res.writeHead(500);
		res.end();
	}
});

http.createServer(app).listen(port, host, function()
{
	console.log('Running proxy at ' + host + ':' + port + ' for ' + targetHost + ':' + targetPort);
});
