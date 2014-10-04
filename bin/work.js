#!/usr/bin/env node

const NUM_FEED_PARSER_WORKERS = 5;
const NUM_VIDEO_REFRESHER_WORKERS = 5;

var kue = require('kue');
var jobs = kue.createQueue({
  prefix: process.env.REDIS_PREFIX || 'podcaster',
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    auth: process.env.REDIS_AUTH
  }
});

var FeedParserWorker = require('../workers/feed-parser-worker');
var RefreshVideoDataWorker = require('../workers/refresh-video-data-worker');

var apiHost = process.env.API_HOST || '127.0.0.1';
var apiPort = process.env.API_PORT || 1337;
var apiToken = process.env.API_TOKEN;

process.once('SIGTERM', function(thing) {
  jobs.shutdown(function(err) {
    if (err) console.log('Error shutting down kue: ' + err);
    else console.log('Kue shut down successfully');
    process.exit( 0 );
  }, 5000 );
});

jobs.process('feed parser', NUM_FEED_PARSER_WORKERS, function(job, done) {
  var feedId = job.data.id;
  var feedUrl = job.data.url;
  new FeedParserWorker(apiHost, apiPort, apiToken, feedId, feedUrl)
    .work(job, done);
});

jobs.process('refresh video data', NUM_VIDEO_REFRESHER_WORKERS, function(job, done) {
  var videoId = job.data.id;
  var videoUrl = job.data.url;
  console.log('NEW JOB: refresh video data videoId: ' + videoId + ' videoUrl: ' + videoUrl);
  new RefreshVideoDataWorker(apiHost, apiPort, apiToken, videoId, videoUrl)
    .work(job, done);
});