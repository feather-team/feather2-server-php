var express = require('express');
var args = process.argv.join('|');
var port = /\-\-port\|(\d+)(?:\||$)/.test(args) ? ~~RegExp.$1 : 8080;
var https = /\-\-https\|(true)(?:\||$)/.test(args) ? !!RegExp.$1 : false;
var php_exec = /\-\-php_exec\|(.+?)(?:\||$)/.test(args) ? ~~RegExp.$1 : 'php-cgi';
var path = require('path');
var DOCUMENT_ROOT = path.resolve(/\-\-root\|(.*?)(?:\||$)/.test(args) ? RegExp.$1 : process.cwd());
var bodyParser = require('body-parser'), cookieParser = require('cookie-parser');
var app = express();
var phpcgi = require('node-phpcgi');
var stream = process.stdout;
var fs = require('fs');

// logger
app.use(require('morgan')('short'));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: false
}))

// parse application/json
app.use(bodyParser.json());
app.use(cookieParser());

var STATIC_ROOT = path.join(DOCUMENT_ROOT, 'static');

app.use(require('./dev-tool.js')(DOCUMENT_ROOT, STATIC_ROOT));
// 静态文件输出
app.use(express.static(STATIC_ROOT));

// utf8 support
app.use(function(req, res, next) {
    // attach utf-8 encoding header to text files.
    if (/\.(?:js|json|text|css)$/i.test(req.path)) {
        res.charset = 'utf-8';
    }

    next();
});

// // 对于不存在的文件全部走 index.php
app.use(phpcgi({
    documentRoot: DOCUMENT_ROOT,
    entryPoint: '/index.php',
    includePath: '/',
    handler: php_exec || 'php-cgi'
}));

// Bind to a port
var fs = require('fs');
var path = require('path');
var server;

if (https) {
    server = require('https').createServer({
        key: fs.readFileSync(path.join(__dirname, 'key.pem'), 'utf8'),
        cert: fs.readFileSync(path.join(__dirname, 'cert.pem'), 'utf8'),
    }, app);
} else {
    server = require('http').createServer(app);
}

server.listen(port, '0.0.0.0', function() {
    console.log(' Listening on ' + (https ? 'https' : 'http') + '://127.0.0.1:%d', port);
});

// 在接收到关闭信号的时候，关闭所有的 socket 连接。
(function() {
    var sockets = [];

    server.on('connection', function(socket) {
        sockets.push(socket);

        socket.on('close', function() {
            var idx = sockets.indexOf(socket);
            ~idx && sockets.splice(idx, 1);
        });
    });

    var finalize = function() {
        // Disconnect from cluster master
        process.disconnect && process.disconnect();
        process.exit(0);
    }

    // 关掉服务。
    process.on('SIGTERM', function() {
        console.log(' Recive quit signal in worker %s.', process.pid);
        sockets.length ? sockets.forEach(function(socket) {
            socket.destroy();
            finalize();
        }) : server.close(finalize);
    });
})(server);