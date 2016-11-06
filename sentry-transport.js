var util = require('util'),
    raven = require('raven'),
    winston = require('winston'),
    _ = require('lodash');

var Sentry = winston.transports.Sentry = function (options) {
  winston.Transport.call(this, _.pick(options, ["level", "silent", "handleExceptions", "exceptionsLevel"]));

  // Default options
  this.defaults = {
    dsn: '',
    patchGlobal: false,
    logger: 'root',
    levelsMap: {
      silly: 'debug',
      verbose: 'debug',
      info: 'info',
      debug: 'debug',
      warn: 'warning',
      error: 'error'
    },
    tags: {},
    extra: {}
  };

  // For backward compatibility with deprecated `globalTags` option
  options.tags = options.tags || options.globalTags;

  this.options = _.defaultsDeep(options, this.defaults);

  this._sentry = this.options.raven || new raven.Client(this.options.dsn, this.options);

  if(this.options.patchGlobal) {
    this._sentry.patchGlobal();
  }

  // Handle errors
  this._sentry.on("error", function(error) {
    var message = "Cannot talk to sentry.";
    if(error && error.reason) {
      message += " Reason: " + error.reason;
    }
    console.log(message);
  });

  // Expose sentry client to winston.Logger
  winston.Logger.prototype.sentry_client = this._sentry;
};

//
// Inherit from `winston.Transport` so you can take advantage
// of the base functionality and `.handleExceptions()`.
//
util.inherits(Sentry, winston.Transport);

//
// Expose the name of this Transport on the prototype
Sentry.prototype.name = "sentry";
//

Sentry.prototype._extra = function (level, meta) {
  meta = meta || {};
  var extraData = _.extend({}, meta),
    tags = extraData.tags;
  delete extraData.tags;

  var extra = {
    level: this.options.levelsMap[level],
    extra: extraData,
    tags: tags
  };

  if (extraData.request) {
    extra.request = extraData.request;
    delete extraData.request;
  }

  if (extraData.user) {
    extra.user = extraData.user;
    delete extraData.user;
  }

  return extra;
};

Sentry.prototype._captureError = function (err, msg, meta, callback) {
  var extra = _.extend({}, meta);

  if (err instanceof Error) {
    if (msg) {
      extra.message = msg + ". cause: " + extra.message;
      msg = err;
    }
  }

  this._sentry.captureException(msg, extra, function() {
    callback(null, true);
  });
};

Sentry.prototype.log = function (level, msg, meta, callback) {
  if (this.silent) {
    return callback(null, true);
  }

  var extra = this._extra(level, meta);

  try {
    if (extra.level == "error") {
      this._captureError(meta, msg, extra, callback);
    } else {
      this._sentry.captureMessage(msg, extra, function() {
        callback(null, true);
      });
    }
  } catch(err) {
    console.error(err);
  }
};

Sentry.prototype.logException = function (msg, meta, callback, err) {
  var extra = this._extra(this.exceptionsLevel, meta);

  this._captureError(err, msg, extra, callback);
};

module.exports = Sentry;
