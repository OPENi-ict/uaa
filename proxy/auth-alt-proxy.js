var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var qs = require('qs');
var util = require('util');

var httpProxy = require('http-proxy');
var connect = require('connect');
var bodyParser = require('body-parser');
var morgan  = require('morgan');
var rawBody = require('raw-body');
var typer = require('media-typer');

// --- PARAMS

var host = process.argv[2] || '0.0.0.0';
var port = parseInt(process.argv[3], 10) || 8886;
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
		if(res.headers['location'].indexOf('error') < 0 && cb)
			return cb(res.statusCode, (res.headers['set-cookie'] + '').match(/JSESSIONID\=(.*?)\;/)[1]);
		if(cb)
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

function authorizeRequest(session, response_type, client_id, scope, redirect_uri, cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/oauth/authorize?response_type=' + response_type + '&client_id=' + client_id + '&scope=' + scope + '&redirect_uri=' + redirect_uri,
		port: targetPort,
		method: 'POST',
		headers: {'cookie': 'JSESSIONID=' + encodeURIComponent(session)}
	},
	function(res)
	{
		rawBody(res,
		{
			length: res.headers['content-length'],
			limit: '1mb',
			encoding: 'utf8'
			//encoding: typer.parse(req.headers['content-type']).parameters.charset
		},
		function (err, string)
		{
			if (err && cb)
				return cb(400);
			if(cb)
				cb(res.statusCode, string)
		});
	});
	req.end();
}

function approveClientRequest(session, user_oauth_approval, scopes, cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/oauth/authorize?user_oauth_approval=' + encodeURIComponent(user_oauth_approval) + scopes,
		port: targetPort,
		method: 'GET',
		headers: {'Accept':'application/json', 'cookie': 'JSESSIONID=' + encodeURIComponent(session)}
	},
	function(res)
	{
		rawBody(res,
		{
			length: res.headers['content-length'],
			limit: '1mb',
			encoding: 'utf8'
			//encoding: typer.parse(req.headers['content-type']).parameters.charset
		},
		function (err, string)
		{
			if (err && cb)
				return cb(400);
			if(cb)
				cb(res.statusCode, string)
		});
	});
	req.end();
}

function approveClientDialogRequest(session, response_type, client_id, scope, redirect_uri, cb)
{
	var req = http.request(
	{
		host: targetHost,
		path: '/uaa/oauth/authorize?response_type=' + response_type + '&client_id=' + client_id + '&scope=' + scope + '&redirect_uri=' + redirect_uri,
		port: targetPort,
		method: 'GET',
		headers: {'Accept':'application/json', 'cookie': 'JSESSIONID=' + encodeURIComponent(session)}
	},
	function(res)
	{
		rawBody(res,
		{
			length: res.headers['content-length'],
			limit: '1mb',
			encoding: 'utf8'// typer.parse(req.headers['content-type']).parameters.charset
		},
		function (err, string)
		{
			console.log(res.headers)
			console.log('>> ' + string);
			if (err && cb)
				return cb(400);
			if(cb)
				cb(res.statusCode, string)
		});
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
.use(function(req, res, next)
{
	if (!req.query)
		req.query = ~req.url.indexOf('?')? qs.parse(req.url.split("?")[1]) : {};
	next();
})
.use('/uaa/session', function(req, res, next)
{
	if(req.method === 'POST' && req.body['username'] != undefined && req.body['password'] != undefined)
	{
		loginRequest(req.body['username'], req.body['password'], function(statusCode, session)
		{
			if(session != null)
			{
				res.setHeader('Content-Type', 'application/x-www-form-urlencoded');
				res.writeHead(200);
				res.write(session);
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
		res.writeHead(200);
		res.end();
	}
	else
		next();
})
.use('/uaa/oauth/authorize', function (req, res, next)
{
	console.log(req.query);
	if(req.method === 'POST' && req.body['session'] != null && req.body['response_type'] != null &&
		req.body['client_id'] != null && req.body['scope'] != null && req.body['credentials'] != null)
	{
		authorizeClientRequest(req.body['session'], req.body['response_type'], req.body['client_id'],
			req.body['scope'], req.body['credentials'], function(statusCode, body)
		{
			if(body != null)
			{
				res.setHeader('Content-Type', 'application/json');
				res.writeHead(200);
				res.write(body);
				res.end();
			}
			else
			{
				res.writeHead(400);
				res.end();
			}
		});
	}
	else if(req.method === 'POST' && req.body['session'] != null && req.body['user_oauth_approval'] != null)
	{
		req.body['scopes'] = "";
		approveClientRequest(req.body['session'], req.body['user_oauth_approval'], req.body['scopes'], function(statusCode, body)
		{
			if(body != null)
			{
				res.setHeader('Content-Type', 'application/json');
				res.writeHead(200);
				res.write(body);
				res.end();
			}
			else
			{
				res.writeHead(400);
				res.end();
			}
		});
	}
	else if(req.method === 'GET' && req.query['session'] != null && req.query['response_type'] != null &&
		req.query['client_id'] != null)
	{
		approveClientDialogRequest(req.query['session'], req.query['response_type'],
			req.query['client_id'], req.query['scope'], req.query['redirect_uri'], function(statusCode, body)
		{
			console.log(statusCode);
			if(body != null)
			{
				res.setHeader('Content-Type', 'application/json');
				res.writeHead(200);
				console.log(body);
				res.write(body);
				res.end();
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
.use(function (error, req, res, next)
{
	if(error)
	{
		res.writeHead(406);
		res.write(error + '');
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
