/*
 * osc.js: An Open Sound Control library for JavaScript that works in both the browser and Node.js
 *
 * Copyright 2014, Colin Clark
 * Licensed under the MIT and GPL 3 licenses.
 */

/*global chrome*/

var osc = osc || {};

(function () {

    "use strict";

    osc.listenToTransport = function (that, transport, idName) {
        transport.onReceive.addListener(function (e) {
            if (e[idName] === that[idName]) {
                that.emit("data", e.data);
            }
        });

        transport.onReceiveError.addListener(function (err) {
            that.emit("error", err);
        });

        that.emit("ready");
    };

    osc.emitNetworkError = function (that, resultCode) {
        that.emit("error",
            "There was an error while opening the UDP socket connection. Result code: " +
            resultCode);
    };

    osc.SerialPort = function (options) {
        this.on("open", this.listen.bind(this));
        osc.SLIPPort.call(this, options);
    };

    var p = osc.SerialPort.prototype = Object.create(osc.SLIPPort.prototype);
    p.constructor = osc.SerialPort;

    p.open = function () {
        var that = this,
            connectionOpts = {
                bitrate: that.options.bitrate
            };

        chrome.serial.connect(this.options.devicePath, connectionOpts, function (info) {
            that.connectionId = info.connectionId;
            that.emit("open", info);
        });
    };

    p.listen = function () {
        osc.listenToTransport(this, chrome.serial, "connectionId");
    };

    p.sendRaw = function (encoded) {
        if (!this.connectionId) {
            return;
        }

        var that = this;

        chrome.serial.send(this.connectionId, encoded, function (bytesSent, err) {
            if (err) {
                that.emit("error", err + ". Total bytes sent: " + bytesSent);
            }
        });
    };

    p.close = function () {
        if (this.connectionId) {
            var that = this;
            chrome.serial.disconnect(this.connectionId, function (result) {
                if (result) {
                    that.emit("close");
                }
            });
        }
    };


    osc.UDPPort = function (options) {
        osc.Port.call(this, options);
        var o = this.options;
        o.localAddress = o.localAddress || "127.0.0.1";
        o.localPort = o.localPort !== undefined ? o.localPort : 57121;

        this.on("open", this.listen.bind(this));
    };

    p = osc.UDPPort.prototype = Object.create(osc.Port.prototype);
    p.constructor = osc.UDPPort;

    p.open = function () {
        var o = this.options,
            props = {
                persistent: o.persistent,
                name: o.name,
                bufferSize: o.bufferSize
            },
            that = this;

        chrome.sockets.udp.create(props, function (info) {
            that.socketId = info.socketId;
            that.bindSocket();
        });
    };

    p.bindSocket = function () {
        var that = this,
            o = this.options;

        chrome.sockets.udp.bind(this.socketId, o.localAddress, o.localPort, function (resultCode) {
            if (resultCode > 0) {
                osc.emitNetworkError(that, resultCode);
                return;
            }

            that.emit("open", resultCode);
        });
    };

    p.listen = function () {
        osc.listenToTransport(this, chrome.sockets.udp, "socketId");
    };

    p.sendRaw = function (encoded, address, port) {
        if (!this.socketId) {
            return;
        }

        var o = this.options,
            that = this;

        address = address || o.remoteAddress;
        port = port !== undefined ? port : o.remotePort;

        chrome.sockets.udp.send(this.socketId, encoded, address, port, function (info) {
            if (!info) {
                that.emit("error",
                    "There was an unknown error while trying to send a UDP message. " +
                    "Have you declared the appropriate udp send permissions " +
                    "in your application's manifest file?");
            }

            if (info.resultCode > 0) {
                osc.emitNetworkError(that, info.resultCode);
            }
        });
    };

    p.close = function () {
        if (this.socketId) {
            var that = this;
            chrome.sockets.udp.close(this.socketId, function () {
                that.emit("close");
            });
        }
    };
}());
