/*!
 * 本地静态服务器（开发预览 / 端到端测试）
 *   node _build/serve.js [port]      # 默认 8123，仓库根目录
 * 也可以 require 进测试脚本：
 *   const { start } = require("./serve"); start(8124, () => ...);
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function createServer(root) {
  root = root || ROOT;
  return http.createServer(function (req, res) {
    var urlPath = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";

    var file = path.resolve(root, "." + urlPath);
    if (file !== root && file.indexOf(root + path.sep) !== 0) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("403");
      return;
    }

    fs.readFile(file, function (err, buf) {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 " + urlPath);
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      res.end(buf);
    });
  });
}

function start(port, cb) {
  var server = createServer();
  server.listen(port, "127.0.0.1", function () {
    if (cb) cb(server);
    else console.log("serving " + ROOT + " at http://127.0.0.1:" + port);
  });
  return server;
}

if (require.main === module) {
  start(Number(process.argv[2] || 8123));
}

module.exports = { createServer: createServer, start: start, ROOT: ROOT };
