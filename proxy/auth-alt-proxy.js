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

/*var textBody = require("body");
var jsonBody = require("body/json");
var formBody = require("body/form");
var anyBody = require("body/any");*/

// --- PARAMS

var host = process.argv[2] || '0.0.0.0';
var port = parseInt(process.argv[3], 10) || 8886;
var targetHost = process.argv[4] || 'localhost';
var targetPort = parseInt(process.argv[5], 10) || 8877;

// --- REQUESTS

/*
function extend(target)
{
	var sources = [].slice.call(arguments, 1);
	sources.forEach(function(source)
	{
		for (var prop in source)
			target[prop] = source[prop];
	});
	return target;
}*/

var jsonParser = bodyParser.json();
var urlencodedParser = bodyParser.urlencoded({extended: false});

function rerequest(req, cb)
{
	req.headers['accept'] = 'application/json';

	delete req.headers['host'];

	if(req.session)
		req.headers['cookie'] = 'JSESSIONID=' + encodeURIComponent(req.session) + '; Path=/uaa/; HttpOnly';
	if(req.authorization)
		req.headers['authorization'] = 'Basic ' + new Buffer(req.authorization).toString('base64');
	if(req.path)
		req.path = req.path.replace('/uaa-alt/', '/uaa/')
	else
		req.path = req.originalUrl.replace('/uaa-alt/', '/uaa/');

	console.log(req.path)

	var rq = http.request(
	{
		host: targetHost,
		path: req.path,
		port: targetPort,
		method: req.method,
		headers: req.headers
	}, function(rs)
	{
		console.log('+++');
		console.log(rq.path);
		console.log(rq.method);
		console.log(rq._headers);
		if(req.body)
			console.log(req.body.toString('utf-8'));
		console.log('---');
		console.log(rs.statusCode);
		console.log(rs.headers);

		//if(rs.headers['content-length'])
		//{

		/*if(rs.headers['content-type'].indexOf('application/json') > -1)
			jsonParser(rs);
		else if(rs.headers['content-type'].indexOf('application/x-www-form-urlencoded') > -1)
			urlencodedParser(rs);
		else*/
		{
			rawBody(rs,
			{
				//length: rs.headers['content-length'],
				limit: '1mb',
				encoding: 'utf8'
			},
			function (err, string)
			{
				rs.originalBody = rs.body;
				rs.body = string;
				rs.error = err;
				console.log('***');
				console.log(rs.body);

				if(cb && typeof cb === "function")
					cb(rq, rs);
			});
		}

		//}
	});

	if(req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body))
	{
		var b = '';
		if(Object.keys(req.body).length > 0)
		{
			for (var p in req.body)
				if(req.body.hasOwnProperty(p))
					b += encodeURIComponent(p) + '=' + encodeURIComponent(req.body[p]) + '&';

			if(req.scopes && Array.isArray(req.scopes))
				for(var i = 0; i < req.scopes.length; i++)
					b += 'scope.' + i + '=' + encodeURIComponent(req.scopes[i]) + '&';

			b = b.substring(0, b.length - 1);
		}
		req.originalBody = req.body;
		req.body = new Buffer(b, "utf-8");
		req.headers['content-length'] = req.body.length;
	}

	if(req.body)
		req.headers['content-type'] = 'application/x-www-form-urlencoded';

	/*console.log(req.headers);
	console.log(req.session);
	console.log(req.query);
	console.log(new String(req.body, 'utf-8'));
	console.log(req.originalBody);
	console.log(req.path);*/
	//console.log(req.body.credentials);

	/*console.log(req.headers);
	console.log(req.originalBody);
	console.log(req.body);*/
	for (var p in req.headers)
		rq.setHeader(p, req.headers[p])
	if(req.body)
		rq.write(req.body);

	rq.end();
}
//{'authorization': 'Basic ' + encodeURIComponent(client_id + ':' + client_secret)

// --- PROXY MIDDLEWARE

var app = connect()
.use(urlencodedParser)
.use(morgan('combined'))
.use(function(req, res, next)
{
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, PATCH, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, api_key, Authorization');
	res.setHeader('Content-Type', 'application/json');
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
.use(jsonParser)
.use(function(req, res, next)
{
	if (!req.query)
		req.query = ~req.url.indexOf('?')? qs.parse(req.url.split("?")[1]) : {};
	next();
})
.use(function(req, res, next)
{
	//if (!req.session)
	{
		req.session = req.body['session'] || req.query['session'];
		if(req.body['session'])
			delete req.body['session'];
		if(req.query['session'])
			delete req.query['session'];
	}

	//if(!req.authorization)
	{
		req.authorization = req.body['authorization'] || req.query['authorization'];
		if(req.body['authorization'])
			delete req.body['authorization'];
		if(req.query['authorization'])
			delete req.query['authorization'];
	}

	//if(!req.scopes)
	{
		rscp = req.body['scopes'] || req.query['scopes'];

		if(req.body['scopes'])
			delete req.body['scopes'];
		if(req.query['scopes'])
			delete req.query['scopes'];

		if(rscp)
		{
			rscp = rscp.split(' ');
			req.scopes = [];
			for(var i = 0; i < rscp.length; ++i)
			{
				if(rscp[i].indexOf('scope.') != 0)
					rscp[i] = 'scope.' + req.scopes[i];
				if(rscp[i].indexOf('scope.openi.') == 0)
				{
					try
					{
						var t = req.scopes[i].substring(12, req.scopes[i].length);
						t = new Buffer(t, 'base64').toString('utf-8');
						t = JSON.parse(t);
						req.scopes.push(rscp[i]);
					}
					catch(_){}
				}
			}
			console.log('pppp');
			console.log(req.scopes);
		}
	}

	/*console.log('----');
	console.log(req.session);
	console.log(req.authorization);*/

	next();
})
.use('/uaa-alt/session', function(req, res, next)
{
	if(req.method === 'POST')// || req.method === 'GET')
	{
		req.path = '/uaa/login.do';

		rerequest(req, function(rq, r)
		{
			if(r.headers['location'] && r.headers['location'].indexOf('error') < 0)
			{
				res.setHeader('content-type', 'application/json');
				res.writeHead(200);
				var c = (r.headers['set-cookie'] + '').match(/JSESSIONID\=(.*?)\;/)[1];
				res.write('{\"session\":\"' + c + '\"}');
				res.end();
			}
			else
			{
				res.setHeader('Content-Type', 'application/json');
				res.writeHead(400);
				res.write('{"error": "Login incorrect"}');
				res.end();
			}
		});
	}
	else if(req.method === 'DELETE')
	{
		req.method = 'GET';
		req.path = '/uaa/logout.do';
		delete req.headers['content-type'];
		delete req.headers['content-length'];
		//req.removeHeader('content-length');
		req.body = undefined;

		rerequest(req, function(rq, r)
		{
			res.setHeader('content-type', 'application/json');
			res.writeHead(200);
			res.end();
		});
	}
	else
		next();
})
.use('/uaa-alt/oauth/authorize', function (req, res, next)
{
	if(req.method === 'POST' || req.method === 'GET')
	{
		req.path = req.originalUrl;

		rerequest(req, function(rq, r)
		{
			if (r.error)
			{
				res.writeHead(400);
				res.write('{"error":"' + r.error.replace('"', '\"') + '"}')
				res.end();
			}
			else
			{
				if(r.headers['location'])// && r.headers['location'].indexOf('error') < 0)
				{
					var t = {};

					var tt = (r.headers['location'] + '').split('#');
					if(tt.length < 2)
						tt = (r.headers['location'] + '').split('?');
					
					if(tt.length > 1)
					{
						//tt = tt[tt.length - 1];
						//tt = decodeURIComponent(tt.replace(/\=/g, '\":\"').replace(/\&/g, '\",\"'));
						//t = '{\"' + tt.toString() + '\"}';
						tt = tt[1].split('&');
						for(var i = 0; i < tt.length; ++i)
						{
							tt[i] = tt[i].split('=');
							if(tt[i].length == 2)
								t[tt[i][0]] = tt[i][1];
						}
					}

					console.log(t);

					res.setHeader('Content-Type', 'application/json');
					if(r.headers['location'])
						res.setHeader('location', r.headers['location']);
					if(t.length == 0)
						t["error"] = "Session invalid or other error";
					if(tt.indexOf('error') > -1)
						res.writeHead(400);
					else
						res.writeHead(200);

					res.write(JSON.stringify(t));
					res.end();
				}
				else
				{
					/*console.log(r.body);
					console.log(r.originalBody);
					console.log(r.headers);*/
					res.setHeader('Content-Type', 'application/json');
					res.writeHead(200);
					if(r.body)
						res.write(r.body);
					res.end();
				}
			}
		});
		//res.writeHead(200);
		//res.end();
	}
	else
		next();
})
.use('/uaa-alt/oauth/token', function (req, res, next)
{
	console.log(req.body);
	if(req.method === 'POST' || req.method === 'GET')
		rerequest(req, function(rq, r)
		{
			/*console.log(r.headers);
			console.log(r.body);
			console.log(r.originalBody);
			console.log(r.statusCode);*/

			res.setHeader('Content-Type', 'application/json');
			if(res.body)
				res.writeHead(200);
			else
				res.writeHead(400);

			if(r.body)
				res.write(r.body);
			res.end();
		});
	else
		next();
})
.use(function(error, req, res, next)
{
	if(error)
	{
		res.writeHead(406);
		//res.write(error + '');
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
