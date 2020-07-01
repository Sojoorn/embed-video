const URL = require('url');
const URI = require('uri-js');
const promise = require('promise-polyfill');
const {fetch} = require('fetch-ponyfill')({Promise: promise});
const escape = require('lodash.escape');

const YOUTUBE = 'youtube';
const VIMEO = 'vimeo';
const DAILYMOTION = 'dailymotion';

const validVimeoOpts = [
  'thumbnail_small',
  'thumbnail_medium',
  'thumbnail_large',
];
const validYouTubeOpts = [
  'default',
  'mqdefault',
  'hqdefault',
  'sddefault',
  'maxresdefault',
];
const validDailyMotionOpts = [
  'thumbnail_60_url',
  'thumbnail_120_url',
  'thumbnail_180_url',
  'thumbnail_240_url',
  'thumbnail_360_url',
  'thumbnail_480_url',
  'thumbnail_720_url',
  'thumbnail_1080_url',
];

const VIMEO_MATCH_RE = /^(?:\/video|\/channels\/[\w-]+|\/groups\/[\w-]+\/videos)?\/(\d+)/;

function embed(url, opts) {
  const res = embed.info(url);
  return res && embed[res.source] && embed[res.source](res.id, opts);
}

embed.info = function(url) {
  const uri = URI.parse(url);
  url = URL.parse(url, true);

  let id;

  id = detectYoutube(url, uri);
  if (id) {
    return {
      id,
      source: YOUTUBE,
      url: url.href,
      embedUrl: `//www.youtube.com/embed/${id}`,
    };
  }

  id = detectVimeo(url, uri);
  if (id) {
    return {
      id,
      source: VIMEO,
      url: url.href,
      embedUrl: `//player.vimeo.com/video/${id}`,
    };
  }

  id = detectDailymotion(url, uri);
  if (id) {
    return {
      id,
      source: DAILYMOTION,
      url: url.href,
      embedUrl: `//www.dailymotion.com/embed/video/${id}`,
    };
  }
};

// For compat with <=2.0.1
embed.videoSource = embed.info;

embed.image = function(url, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts = opts || {};

  const res = embed.info(url);
  if (!res && cb) {
    return setTimeout(() => {
      cb();
    });
  }
  return res && embed[res.source].image(res.id, opts, cb);
};

function detectVimeo(url, uri) {
  let match;
  return (uri.host === 'vimeo.com' && (match = VIMEO_MATCH_RE.exec(url.pathname))) ? match[1] : null;
}

function detectYoutube(url, uri) {
  if (uri.host.indexOf('youtube.com') > -1) {
    return url.query.v;
  }

  if (uri.host === 'youtu.be') {
    return url.pathname.split('/')[1];
  }

  return null;
}

function detectDailymotion(url, uri) {
  if (uri.host.indexOf('dailymotion.com') > -1) {
    return url.pathname.split('/')[2].split('_')[0];
  }

  if (uri.host === 'dai.ly') {
    return url.pathname.split('/')[1];
  }

  return null;
}

embed.vimeo = function(id, opts) {
  opts = parseOptions(opts);
  return `<iframe src="//player.vimeo.com/video/${id}${opts.query}"${opts.attr} frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>`;
};

embed.youtube = function(id, opts) {
  opts = parseOptions(opts);
  return `<iframe src="//www.youtube.com/embed/${id}${opts.query}"${opts.attr} frameborder="0" allowfullscreen></iframe>`;
};

embed.dailymotion = function(id, opts) {
  opts = parseOptions(opts);
  return `<iframe src="//www.dailymotion.com/embed/video/${id}${opts.query}"${opts.attr} frameborder="0" allowfullscreen></iframe>`;
};

embed.youtube.image = function(id, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts = opts || {};

  opts.image = validYouTubeOpts.indexOf(opts.image) > 0 ? opts.image : 'default';

  const src = `//img.youtube.com/vi/${id}/${opts.image}.jpg`;

  const result = {
    src,
    html: `<img src="${src}"/>`,
  };

  if (!cb) return result.html;

  setTimeout(() => {
    cb(null, result);
  });
};

embed.vimeo.image = function(id, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  if (!cb) throw new Error('must pass embed.vimeo.image a callback');

  opts = opts || {};

  opts.image = validVimeoOpts.indexOf(opts.image) >= 0 ? opts.image : 'thumbnail_large';

  fetch(`https://vimeo.com/api/v2/video/${id}.json`)
      .then((res) => {
        if (res.status !== 200) {
          throw new Error('unexpected response from vimeo');
        }

        return res.json();
      })
      .then((body) => {
        if (!body || !body[0] || !body[0][opts.image]) {
          throw new Error(`no image found for vimeo.com/${id}`);
        }

        const src = body[0][opts.image].split(':')[1];

        const result = {
          src,
          html: `<img src="${src}"/>`,
        };

        cb(null, result);
      })
      .catch((err) => {
        cb(err);
      });
};

embed.dailymotion.image = function(id, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  if (!cb) throw new Error('must pass embed.dailymotion.image a callback');

  opts = opts || {};

  opts.image = validDailyMotionOpts.indexOf(opts.image) >= 0 ? opts.image : 'thumbnail_480_url';

  fetch(`https://api.dailymotion.com/video/${id}?fields=${opts.image}`)
      .then((res) => {
        if (res.status !== 200) {
          throw new Error('unexpected response from dailymotion');
        }

        return res.json();
      })
      .then((body) => {
        if (!body || !body[opts.image]) {
          throw new Error(`no image found for dailymotion.com/${id}`);
        }

        const src = body[opts.image];

        const result = {
          src,
          html: `<img src="${src}"/>`,
        };

        cb(null, result);
      })
      .catch((err) => {
        cb(err);
      });
};

function serializeQuery(query) {
  return Object.keys(query).map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`).join('&');
}

function parseOptions(opts) {
  let queryString = '';
  let attributes = '';

  if (opts && opts.hasOwnProperty('query')) {
    queryString = `?${serializeQuery(opts.query)}`;
  }

  if (opts && opts.hasOwnProperty('attr')) {
    attributes = ` ${Object.keys(opts.attr).map((key) => `${key}="${escape(opts.attr[key])}"`).join(' ')}`;
  }

  return {query: queryString, attr: attributes};
}

module.exports = embed;
