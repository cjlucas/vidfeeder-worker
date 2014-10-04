var spawn = require('child_process').spawn;
var fs = require('fs');
var temp = require('temp');
var async = require('async');

var newRequestClient = require('./common').newRequestClient;
var YoutubeDLScraper = require('./common').YoutubeDLScraper;
var fetchContentLengthTask = require('./common').fetchContentLengthTask;

var job;

function FeedParserWorker(apiHost, apiPort, apiToken, feedId, feedUrl) {
  this.feedId  = feedId;
  this.feedUrl = feedUrl;
  this.client = newRequestClient(apiHost, apiPort, apiToken);
  this.videos = [];

  var self = this;

  this.work = function(j, done) {
    job = j;

    var url = '/api/feeds/' + self.feedId;
    job.log('Fetching %s', url);
    self.client.get(url, function (err, res, feed) {
      if (err) return done(err);
      if (res.statusCode == 403) return done(new Error('Permission denied'));
      if (!feed) return done(new Error('Could not get feed'));

      job.log('Feed has %d existing videos', feed.videos.length);

      temp.open('youtubedlDownloadArchive', function (err, info) {
        if (err) return done(err);
        job.log('Writing download archive to: ' + info.path);

        feed.videos.forEach(function (video) {
          // the format of the youtube-dl download archive is "SITE VIDEOID"
          var line = 'youtube ' + video.videoId;
          fs.writeSync(info.fd, line + '\n');
        });

        fs.closeSync(info.fd);

        var opts = {downloadArchive: info.path};
        var scraper = new YoutubeDLScraper(self.feedUrl, opts);
        var total = 0;
        scraper.on('video', function(video) {
          self.videos.push(video);
        });

        scraper.on('done', self.onDone);

        scraper.scrape();
      });
    });

    this.onDone = function(err) {
      job.log('scraper finished');

      if (err) return done(err);

      if (self.videos.length == 0) {
        job.log('No new videos.');
        return done();
      }

      var uploadVideosTask = function(videos) {
        return function(cb) {
          self.client
            .post('/api/feeds/' + self.feedId + '/add_videos',
            {videos: videos},
            function (err, res, body) {
              job.log('/add_videos response status code: %d', res.statusCode);
              cb();
            });
        }
      };

      var afterFormatSizeFetches = function () {
        const LIMIT = 100;
        var cursor = 0;
        var tasks = [];
        while (self.videos.length - cursor > 0) {
          var videos = self.videos.slice(cursor, cursor += LIMIT);
          tasks.push(uploadVideosTask(videos));
        }

        job.log('Uploading %d videos in %d part(s)...',
          self.videos.length, tasks.length);
        async.series(tasks, done);
      };

      // fetch content lengths for all formats, then upload videos
      var tasks = [];
      self.videos.forEach(function (video) {
        video.formats.forEach(function (format) {
          tasks.push(fetchContentLengthTask(format));
        });
      });

      job.log('Executing %d fetch content length tasks...', tasks.length);
      async.parallelLimit(tasks, 10, afterFormatSizeFetches);
    };
  }
}

module.exports = FeedParserWorker;
