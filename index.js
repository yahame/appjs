var path = require('path'),
    router = require('./lib/router'),
    bindings = require('./lib/bindings');

var App = bindings.App,
    Window = bindings.Window;


function extend(obj){
  var desc = { enumerable: false, configurable: true, writable: true };
  for (var i=1; i < arguments.length; i++) {
    Object.keys(arguments[i]).forEach(function(key){
      desc.value = this[key];
      Object.defineProperty(obj, key, desc);
    }, arguments[i]);
  }
}

var _extend = extend;
var createWin = App.prototype.createWindow;


extend(App.prototype, {
  extend: function extend(mod){
    _extend(this, mod.prototype);
    mod.call(this);
  },
  createWindow: function createWindow(url, settings){
    if (settings.icons) {
      ['smaller', 'small', 'big', 'bigger'].forEach(function(size){
        settings.icons[size] = path.resolve(settings.icons[size] || '');
      });
    } else {
      settings.icons = {};
    }

    var win = createWin.call(this, url, settings);
    this.windows.push(win);
    win.once('ready', function(){
      win.runInBrowser(initBrowser);
    });
    return win;
  },
  send: function send(window, type, msg){
    if (arguments.length === 2) {
      msg = type;
      type = window;
      window = 0;
    }
    if (window in this.windows) {
      return this.windows[window].send(type, msg);
    }
  }
});

var IPC = {
  encode: function encode(msg){
    if (msg == null)
      return '{}';
    else if (typeof msg === 'object')
      return JSON.stringify(msg);
    else if (typeof msg === 'string')
      return msg;
    else
      throw new TypeError("Tried to encode invalid type");
  },
  decode: function decode(msg){
    try {
      return JSON.parse(msg);
    } catch (e) {
      return { error: e };
    }
  }
};

function initBrowser(){
  var sendSync = appjs.send;
  var events = {};

  function encode(msg){
    if (msg == null)
      return '{}';
    else if (typeof msg === 'object')
      return JSON.stringify(msg);
    else if (typeof msg === 'string')
      return msg;
    else
      throw new TypeError("Tried to encode invalid type");
  }

  function decode(msg){
    try {
      return JSON.parse(msg);
    } catch (e) {
      return { error: e };
    }
  }


  appjs.on = function on(types, handler){
    types.split(/\s+/).forEach(function(type){
      var listeners = events[type] || (events[type] = []);
      if (!~listeners.indexOf(handler)) {
        listeners.push(handler);
      }
    });
  };

  appjs.off = function off(types, handler){
    types.split(/\s+/).forEach(function(type){
      if (events[type]) {
        var index = events[type].indexOf(type);
        ~index && events[type].splice(index, 1);
      }
    });
  };

  appjs.onmessage = function message(msg){
    var result = {};
    msg = decode(msg);

    if (msg && msg.type && events[msg.type]) {
      var listeners = events[msg.type];
      var temp;
      for (var i=0; i < listeners.length; i++) {
        temp = listeners[i].call(appjs, msg.msg, result);
        if (temp != null) {
          result = temp;
        }
      }
    }
    return encode(result);
  };

  appjs.send = function send(type, msg){
    msg = { type: type, msg: msg };
    return decode(sendSync.call(appjs, encode(msg)));
  };

  appjs.on('log', function(obj){
    console.log(obj);
  });
}

var sendSync = Window.prototype.send;
delete Window.prototype.sendSync;

Window.prototype.__proto__ = process.EventEmitter.prototype;

extend(Window.prototype, {
  onmessage: function onmessage(msg){
    var result = {};
    msg = IPC.decode(msg);

    if (msg && msg.type && this.listeners[msg.type]) {
      this.emit(msg.type, msg.msg, result);
    }

    return IPC.encode(result);
  },
  send: function send(type, msg){
    msg = { type: type, msg: msg };
    return IPC.decode(sendSync.call(this, IPC.encode(msg)));
  }
});


module.exports = {
  init: function init() {
    var app = bindings.init.apply(null, arguments);

    app.windows = [];

    app.extend(router);

    app.on("exit",function(){
      process.nextTick(function(){
        process.exit();
      });
    });

    return app;
  }
};
