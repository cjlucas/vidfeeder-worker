var request = require('request-json'); // TODO: use json:true with request
var req     = require('request');
var spawn   = require('child_process').spawn;
var util    = require('util');
var EventEmitter = require('events').EventEmitter;

/**
 * Map youtube-dl json data to data suitable for /api/feeds/add_videos
 */
function parseYoutubeDlJSON(data) {
  var video = {
    videoId: data.display_id,
    title: data.title,
    description: data.description,
    image: data.thumbnail,
    duration: data.duration,
    uploadDate: new Date(
      data.upload_date.slice(0, 4),
      data.upload_date.slice(4, 6),
      data.upload_date.slice(6, 8)
    ),
    formats: []
  };

  data.formats.forEach(function(format) {
    this.formats.push({
      videoUrl: format.url,
      height: format.height,
      width: format.width,
      ext: format.ext,
      acodec: format.acodec
    });
  }, video);

  return video;
}

module.exports.parseYoutubeDlJSON = parseYoutubeDlJSON;

function newRequestClient(host, port, token) {
  var client = request.newClient('http://' + host + ':' + port);
  if (token != null) client.setToken(token);
  return client;
}

module.exports.newRequestClient = newRequestClient;

function getContentLength(url, callback) {
  var opts = {timeout: 5000};
  req.head(url, opts, function(err, res) {
    if (err) return callback(err, null);
    return callback(null, res.headers['content-length']);
  });
}

module.exports.getContentLength = getContentLength;

function fetchContentLengthTask(format) {
  return function(cb) {
    getContentLength(format.videoUrl, function(err, contentLength) {
      if (!err) format.size = contentLength;
      cb();
    });
  };
}

module.exports.fetchContentLengthTask = fetchContentLengthTask;

function filterVideoFormats(formats) {
  return formats.filter(function(format) {
    // filter audio formats
    if (format.height == null && format.width == null) {
      return false;
    }

    // filter non-mp4 videos
    if (format.ext !== 'mp4') {
      return false;
    }

    // filter DASH video
    if (format.acodec === 'none') {
      return false;
    }

    // filter tiny videos
    if (format.height < 240) {
      return false;
    }

    return true;
  });
}

function buildYoutubeDLScraperArgs(url, options) {
  args = [];
  args.push('--ignore-errors');
  args.push('-j');
  args.push(url);

  if (options != null) {
    if (options.downloadArchive != null) {
      args.push('--download-archive');
      args.push(options.downloadArchive);
    }
  }

  return args;
}

YoutubeDLScraper = function(url, options) {
  EventEmitter.call(this);
  this.args = buildYoutubeDLScraperArgs(url, options);
//  var emit = this.emit;

  this.scrape = function() {
    var self = this;
    var child = spawn('youtube-dl', this.args);

    var buffer = '';
    var stderr = '';

    child.stdout.on('data', function(data) {
      buffer += data.toString();
      if (buffer.charAt(buffer.length - 1) === '\n'
        && buffer.charAt(buffer.length - 2) === '}') {
        try {
          var videos = JSON.parse('[' + buffer.trim() + ']');
          buffer = '';
          videos.forEach(function(video) {
            // cleanup video
            video = parseYoutubeDlJSON(video);
            video.formats = filterVideoFormats(video.formats);
            if (video.formats.length == 0) return;

            self.emit('video', video);
          });
        } catch (e) {
          console.log(e);
        }
      }
    });

    child.stderr.on('data', function(data) {
      stderr += data.toString();
    });

    child.on('close', function(code) {
      self.emit('done');
//      if (stderr.length == 0) return self.emit('done');
//
//      self.emit('done', new Error(stderr));
    });
  };

  return this;
};

util.inherits(YoutubeDLScraper, EventEmitter);

module.exports.YoutubeDLScraper = YoutubeDLScraper;