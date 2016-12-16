var express = require('express');
var router = express.Router();
var path = require('path'), fs = require('fs');
var exists = fs.existsSync || path.existsSync;
var urlParse = require('url').parse;


function isFile(path){
    return exists(path) && fs.statSync(path).isFile(); 
}

function getRewriteConf(pDir){
    var conf = {};

    (fs.readdirSync(pDir) || []).forEach(function(dir){
        var file = path.join(pDir, dir, 'rewrite.js');

        if(isFile(file)){
            delete require.cache[file];
            var _ = require(file) || {};

            for(var key in _){
                conf[key] = _[key];
            }
        }
    });

    return conf;
}

module.exports = function(DOCUMENT_ROOT, STATIC_ROOT){
    router.use(function(req, res, next){
        var current = (fs.readFileSync(path.join(DOCUMENT_ROOT, 'current')) || '').toString();
        var PROJECT_ROOT = path.join(DOCUMENT_ROOT, '../project', current);
        var ENGINE_FILE = path.join(PROJECT_ROOT, 'view/engine.json');
        var config = JSON.parse(fs.readFileSync(ENGINE_FILE));

        if(config.combo && req.originalUrl.indexOf(config.combo.syntax[0]) == 1){
            var combos = req.originalUrl.split(config.combo.syntax[0]);

            if(combos.length > 1){
                //handle combo
                combos = combos[1].split(config.combo.syntax[1]);

                var content = '';

                for(var i = 0, j = combos.length; i < j; i++){
                    var file = path.join(STATIC_ROOT, combos[i]);

                    if(!isFile(file)){
                        res.status(404).end();
                        return;
                    }else{
                        content += fs.readFileSync(file).toString() + '\n'; 
                    }
                }

                res.writeHead(200, {'Content-Type': /(?:css|less|sass)(?:\?|$)/.test(combos[0]) ? 'text/css' : 'text/javascript'});
                res.end(content);
                return;
            }
        }

        var rewrites, url = req.path || '/', file = path.join(DOCUMENT_ROOT, url);

        try{
            rewrites = getRewriteConf(path.join(PROJECT_ROOT, 'conf'));
        }catch(e){
            res.writeHead(500);
            res.end(e.message);
        }

        req.readable = true;

        try{
            if(rewrites){
                var originalUrl = req.originalUrl;

                for(var key in rewrites){
                    if((new RegExp(key, 'i')).test(originalUrl)){
                        url = rewrites[key];

                        if(typeof url == 'function'){
                            url(req, res, next);
                            return;
                        }

                        req.originalUrl = req.url = url + (urlParse(originalUrl).search || '');
                        break;
                    }
                }
            }
        }catch(e){
            res.status(500).send(e.message);
        }

        if(/\.json$/.test(url) && /^\/?[^\/]+\/data\//.test(url)){
            var file = path.join(PROJECT_ROOT, 'data', url);
            res.sendFile(file);
        }else{
            next();
        }
    });

    return router;
};