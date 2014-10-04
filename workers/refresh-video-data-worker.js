var async = require('async');
var exec = require('child_process').exec;
var fs = require('fs');
var temp = require('temp');

var common = require('./common');

var job;

function RefreshVideoDataWorker(apiHost, apiPort, apiToken, videoId, videoUrl) {
  this.videoId = videoId;
  this.videoUrl = videoUrl;
  this.client = common.newRequestClient(apiHost, apiPort, apiToken);
  var self = this;
  var job;

  this.work = function(j, done) {
    job = j;

    var scraper = new common.YoutubeDLScraper(this.videoUrl);

    scraper.on('video', function(video) {
      job.log('Received video data');
      self.onVideo(video);
    });

    scraper.on('done', done);

    job.log('Scraping %s', this.videoUrl);
    scraper.scrape();
  };

  this.onVideo = function(video) {
    var uploadVideo = function() {
      var url = '/api/videos/' + self.videoId;
      job.log('PUT %s', url);
      self.client.put(url, video, function(err, res, body) {
        if (err) return done(err);

        job.log('Request response code: ' + res.statusCode);
      });
    };

    var tasks = [];
    video.formats.forEach(function(format) {
      tasks.push(common.fetchContentLengthTask(format));
    });

    job.log('Fetching content lengths for %d urls', video.formats.length);
    async.parallel(tasks, uploadVideo);
  };
}

module.exports = RefreshVideoDataWorker;
