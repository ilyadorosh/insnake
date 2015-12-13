// Module dependencies.

var express = require('express')
  , routes = require('./routes')
  , url = require('url')
  , fs      = require('fs');

var app = module.exports = express.createServer();
//mySQL
var mysql      = require('mysql');
var connection = mysql.createConnection({
  host     : 'invirto.cglsi5uydsxn.us-west-2.rds.amazonaws.com',
  user     : 'doctor',
  password : '14021969',
  database : 'firstdb'
});



// Configuration

app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type');
    res.header('Access-Control-Allow-Credentials', true);

    next();
});

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

var events = {};
var pending = {};
var connectionTimeout = 60;
var maxAge = 60;
var lastRequestId = 0;
function compact(arr){
    if(!arr) return null;
    var i, data = [];
    for (i=0;i<arr.length;i++){
	if(arr[i]) data.push(arr[i]);
    }
    return data;
}
function currentTimestamp(){return new Date().getTime();}
function debug(user, requestId,message){
    if(message){
	console.log("["+user+"/"+requestId+"] " + message);        
    } else {
        console.log("["+user+"] " + requestId);                
    }
}
function addEvent(user, type, data){
    if(!events[user])
	events[user] = [];
    var event = {type:type, timestamp:currentTimestamp()};
    if(data)
	event.data = data;

    events[user].push(event);
    debug(user, "P", "added " + JSON.stringify(event));
}
function nextEvent(user, timestamp){
    if(!events[user]) return null;
    if(!timestamp) timestamp = 0;
    var event, i;
    var minTimestamp = currentTimestamp() - maxAge * 1000;
    for(i=0;i<events[user].length;i++){
	event = events[user][i];
	debugger;
	if(event.timestamp < minTimestamp) {
	    debug(user, "expired " + JSON.stringify(event));
	    events[user][i] = null;
	    continue;
	}
	if(event.timestamp > timestamp){
	    
	    break;
	}
	events[user][i] = null;
    }
    events[user] = compact(events[user]);
    return event;
}
function notify(user){
    if(!pending[user]) return;
    var i, ctx, event;
    for(i=0;i<pending[user].length;i++){
        ctx = pending[user][i];
	if(!ctx.req){
	    pending[user][i] = null;
	    continue;
	}
	event = nextEvent(user, ctx.timestamp);
	if(event){
	    ctx.req.resume();
	    ctx.res.send(event);
	    ctx.res.end();
	    pending[user][i] = null;
	    debug(user, ctx.id, "sent " + JSON.stringify(event));
	}
    }
    pending[user] = compact(pending[user]);
}
function pause(user, timestamp, req,res,requestId){
    if(!pending[user])
        pending[user] = [];
    var ctx = {
	id: requestId,
	timestamp: timestamp,
	req: req,
	res: res
    };
    pending[user].push(ctx);
    req.connection.setTimeout(connectionTimeout * 1000);
    req.connection.on('timeout', function(){
	ctx.req = null;
	ctx.res = null;
	debug(user, requestId, "timeout");
    });
    req.pause();
    debug(user, requestId, "paused");
}

// Routes


app.get('/icd', function(req, res){                           
var u = req.query;
var cd='A66';
if(u.c) cd=u.c;
//res.render('index')});//rout\es.index);                   
connection.connect();
connection.query("SELECT * from class_mkb where parent_code = '"+cd+"';",
 function(err, rows, fields) {
      if (err) throw err;
      res.render('index',{dis:rows});
      console.log('The solution is: ', rows[0]);
    });                                                       
connection.end();                             
     });


app.get('/', function(req, res){res.send(fs.readFileSync('../bitstarter-ssjs-db/index0.html').toString());});
app.get('/searching', function(req, res, next){
    var val = req.query;
    console.log(val);
    res.send(val.d);
});

app.get('/event', function(req, res){
    var u = req.query;
    if(!u || !u.user){
	res.send(null,400);
	return;
    }
    req.connection.on('close', function(){
	debug(user, requestId, "close");
    });

    var user = u.user,
    timestamp = u.timestamp || 0,
    requestId = lastRequestId++;

    var event = nextEvent(user, timestamp);
    if(!event){
	pause(user, timestamp, req, res, requestId);
    } else {
	res.send(event);
	res.end();
	debug(user, requestId, "sent " + JSON.stringify(event));
    }
});
app.post('/event', function(req, res){
    var u = req.body;
    if(!u || !u.user || !u.type){
	res.send('',400);
	console.log(u);
	return;
    }
    addEvent(u.user, u.type, u.data);
    notify(u.user);
    res.send('');
});

app.listen(80, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
