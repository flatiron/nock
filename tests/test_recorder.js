'use strict';

var nock    = require('../.')
  , test    = require('tap').test
  , http    = require('http')
  , https   = require('https')
  , _       = require('lodash')
  , mikealRequest = require('request')
  , superagent = require('superagent');

var globalCount;

test("setup", function(t) {
  globalCount = Object.keys(global).length;
  t.end();
});

test('recording turns off nock interception (backward compatibility behavior)', function(t) {

  //  We ensure that there are no overrides.
  nock.restore();
  t.false(nock.isActive());
  //  We active the nock overriding - as it's done by merely loading nock.
  nock.activate();
  t.true(nock.isActive());
  //  We start recording.
  nock.recorder.rec();
  //  Nothing happens (nothing has been thrown) - which was the original behavior -
  //  and mocking has been deactivated.
  t.false(nock.isActive());

  t.end();

});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('records', function(t) {
  t.plan(5)

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  const server = http.createServer((request, response) => {
    t.pass('server received a request')
    response.writeHead(200)
    response.end()
  });

  t.once('end', () => {
    server.close()
  });

  nock.recorder.rec(true);
  server.listen(() => {
    const options = {
      uri: `http://localhost:${server.address().port}`,
      method: 'post'
    }

    mikealRequest(options, function(err, resp, body) {
      nock.restore()
      var ret = nock.recorder.play();
      t.equal(ret.length, 1);
      t.type(ret[0], 'string');
      t.equal(ret[0].indexOf(`\nnock('${options.uri}', {"encodedQueryParams":true})\n  .post('/')`), 0);
      t.end()
    })
  })
})

test('records objects', function(t) {
  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  const server = http.createServer((request, response) => {
    t.pass('server received a request')
    response.writeHead(200)
    response.end()
  });

  t.once('end', () => {
    server.close()
  });

  server.listen(() => {
    const url = `http://localhost:${server.address().port}`
    const options = {
      method: 'POST',
      url,
      body: '012345'
    }

    nock.recorder.rec({
      dont_print: true,
      output_objects: true
    });

    mikealRequest(options, function(err, resp, body) {
      nock.restore()
      var ret = nock.recorder.play();
      t.equal(ret.length, 1);
      t.equal(ret[0].scope, url);
      t.equal(ret[0].method, "POST");
      t.equal(ret[0].body, "012345");
      t.end();
    });
  });
});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('records and replays objects correctly', {skip: process.env.AIRPLANE}, function(t) {

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  nock.recorder.rec({
    dont_print: true,
    output_objects: true
  });

  var makeRequest = function(callback) {
    superagent
      .get('http://google.com')
      .end(callback);
  };

  makeRequest(function(err, resp) {

    t.ok(!err);
    t.ok(resp);
    t.ok(resp.headers);

    nock.restore();
    var nockDefs = nock.recorder.play();
    nock.recorder.clear();
    nock.activate();

    t.equal(nockDefs.length, 2);
    var nocks = nock.define(nockDefs);

    makeRequest(function(mockedErr, mockedResp) {

      t.equal(err, mockedErr);
      t.deepEqual(mockedResp.body, resp.body);

      _.each(nocks, function(nock) {
        nock.done();
      });

      t.end();

    });
  });

});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('records and replays correctly with filteringRequestBody', {skip: process.env.AIRPLANE}, function(t) {

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  nock.recorder.rec({
    dont_print: true,
    output_objects: true
  });

  var makeRequest = function(callback) {
    superagent
      .get('http://google.com')
      .end(callback);
  };

  makeRequest(function(err, resp) {

    t.ok(!err);
    t.ok(resp);
    t.ok(resp.headers);

    nock.restore();
    var nockDefs = nock.recorder.play();
    nock.recorder.clear();
    nock.activate();

    t.equal(nockDefs.length, 2);
    var nockDef = _.first(nockDefs);
    var filteringRequestBodyCounter = 0;
    nockDef.filteringRequestBody = function(body, aRecodedBody) {
      ++filteringRequestBodyCounter;
      t.strictEqual(body, aRecodedBody);
      return body;
    };
    var nocks = nock.define(nockDefs);

    makeRequest(function(mockedErr, mockedResp) {

      t.equal(err, mockedErr);
      t.deepEqual(mockedResp.body, resp.body);

      _.each(nocks, function(nock) {
        nock.done();
      });

      t.strictEqual(filteringRequestBodyCounter, 1);
      t.end();

    });
  });

});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('checks if callback is specified', {skip: process.env.AIRPLANE}, function(t) {
  var options = {
    host: 'www.google.com', method: 'GET', path: '/', port: 80
  };

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);
  nock.recorder.rec(true);

  http.request(options).end();
  t.end();
});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('when request body is json, it goes unstringified', {skip: process.env.AIRPLANE}, function(t) {
  var payload = {a: 1, b: true};
  var options = {
    method: 'POST',
    host: 'www.google.com',
    path: '/',
    port: 80
  };

  nock.restore();
  nock.recorder.clear();
  nock.recorder.rec(true);

  var request = http.request(options, function(res) {
    res.resume();
    res.once('end', function() {
      var ret = nock.recorder.play();
      t.ok(ret.length >= 1);
      ret = ret[1] || ret[0];
      t.equal(ret.indexOf("\nnock('http://www.google.com:80', {\"encodedQueryParams\":true})\n  .post('/', {\"a\":1,\"b\":true})\n  .reply("), 0);
      t.end();
    });
  });

  request.end(JSON.stringify(payload));
});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('when request body is json, it goes unstringified in objects', {skip: process.env.AIRPLANE}, function(t) {
  var payload = {a: 1, b: true};
  var options = {
    method: 'POST',
    host: 'www.google.com',
    path: '/',
    port: 80
  };

  nock.restore();
  nock.recorder.clear();
  nock.recorder.rec({
    dont_print: true,
    output_objects: true
  });

  var request = http.request(options, function(res) {
    res.resume();
    res.once('end', function() {
      var ret = nock.recorder.play();
      t.ok(ret.length >= 1);
      ret = ret[1] || ret[0];
      t.type(ret, 'object');
      t.equal(ret.scope, "http://www.google.com:80");
      t.equal(ret.method, "POST");
      t.ok(ret.body && ret.body.a && ret.body.a === payload.a && ret.body.b && ret.body.b === payload.b);
      t.ok(typeof(ret.status) !== 'undefined');
      t.ok(typeof(ret.response) !== 'undefined');
      t.end();
    });
  });

  request.end(JSON.stringify(payload));
});

test('records nonstandard ports', function(t) {
  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  var REQUEST_BODY = 'ABCDEF';
  var RESPONSE_BODY = '012345';

  //  Create test http server and perform the tests while it's up.
  var testServer = http.createServer(function(req, res) {
    res.end(RESPONSE_BODY);
  }).listen(8082, function(err) {

    t.equal(err, undefined);

    var options = { host:'localhost'
                  , port:testServer.address().port
                  , path:'/' }
    ;

    var rec_options = {
      dont_print: true,
      output_objects: true
    };

    nock.recorder.rec(rec_options);

    var req = http.request(options, function(res) {
      res.resume();
      res.once('end', function() {
        nock.restore();
        var ret = nock.recorder.play();
        t.equal(ret.length, 1);
        ret = ret[0];
        t.type(ret, 'object');
        t.equal(ret.scope, "http://localhost:" + options.port);
        t.equal(ret.method, "GET");
        t.equal(ret.body, REQUEST_BODY);
        t.equal(ret.status, 200);
        t.equal(ret.response, RESPONSE_BODY);
        t.end();

        //  Close the test server, we are done with it.
        testServer.close();
      });
    });

    req.end(REQUEST_BODY);
  });

});

test('rec() throws when reenvoked with already recorder requests', function(t) {
  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  nock.recorder.rec();
  try {
    nock.recorder.rec();
    //  This line should never be reached.
    t.ok(false);
    t.end();
  } catch(e) {
    t.equal(e.toString(), 'Error: Nock recording already in progress');
    t.end();
  }
});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('records https correctly', {skip: process.env.AIRPLANE}, function(t) {
  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  var options = { method: 'POST'
                , host:'google.com'
                , path:'/' }
  ;

  nock.recorder.rec({
    dont_print: true,
    output_objects: true
  });

  var req = https.request(options, function(res) {
    res.resume();
    var ret;
    res.once('end', function() {
      nock.restore();
      ret = nock.recorder.play();
      t.equal(ret.length, 1);
      ret = ret[0];
      t.type(ret, 'object');
      t.equal(ret.scope, "https://google.com:443");
      t.equal(ret.method, "POST");
      t.ok(typeof(ret.status) !== 'undefined');
      t.ok(typeof(ret.response) !== 'undefined');
      t.end();
    });
  });
  req.end('012345');
});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('records request headers correctly', {skip: process.env.AIRPLANE}, function(t) {
  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  nock.recorder.rec({
    dont_print: true,
    output_objects: true,
    enable_reqheaders_recording: true
  });

  var req = http.request({
      hostname: 'www.example.com',
      path: '/',
      method: 'GET',
      auth: 'foo:bar'
    }, function(res) {
      res.resume();
      res.once('end', function() {
        nock.restore();
        var ret = nock.recorder.play();
        t.equal(ret.length, 1);
        ret = ret[0];
        t.type(ret, 'object');
        t.equivalent(ret.reqheaders, {
          host: 'www.example.com',
          'authorization': 'Basic Zm9vOmJhcg=='
        });
        t.end();
      });
    }
  );
  req.end();
});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('records and replays gzipped nocks correctly', {skip: process.env.AIRPLANE}, function(t) {

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  nock.recorder.rec({
    dont_print: true,
    output_objects: true
  });

  var makeRequest = function(callback) {
    superagent.get('https://bit.ly/1hKHiTe', callback);
  };

  makeRequest(function(err, resp) {

    t.ok(!err);
    t.ok(resp);
    t.ok(resp.headers);
    t.equal(resp.headers['content-encoding'], 'gzip');

    nock.restore();
    var nockDefs = nock.recorder.play();
    nock.recorder.clear();
    nock.activate();

    // Original bit.ly request is redirected to the target page.
    t.true(nockDefs.length > 1);
    var nocks = nock.define(nockDefs);

    makeRequest(function(mockedErr, mockedResp) {

      t.equal(err, mockedErr);
      t.deepEqual(mockedResp.body, resp.body);
      t.equal(mockedResp.headers['content-encoding'], 'gzip');

      _.each(nocks, function(nock) {
        nock.done();
      });

      t.end();

    });
  });

});

// Do not copy tests that rely on the process.env.AIRPLANE, we are deprecating that via #1231
test('records and replays gzipped nocks correctly when gzip is returned as a string', {skip: process.env.AIRPLANE}, function(t) {
  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  nock.recorder.rec({
    dont_print: true,
    output_objects: true
  });

  var makeRequest = function(callback) {
    mikealRequest.get('http://bit.ly/1hKHiTe', {'headers': {'Accept-Encoding': 'gzip'}}, (error, response, body) => {
      t.error(error);
      callback(null, response, body);
    });
  }

  makeRequest(function(err, response, body) {
    t.ok(response);
    t.ok(response.headers);
    t.equal(response.headers['content-encoding'], 'gzip');

    nock.restore();
    var nockDefs = nock.recorder.play();
    nock.recorder.clear();
    nock.activate();

    // Original bit.ly request is redirected to the target page.
    t.true(nockDefs.length > 1);
    var nocks = nock.define(nockDefs);

    makeRequest(function(mockedErr, mockedResponse, mockedBody) {
      t.equal(err, mockedErr);
      t.deepEqual(mockedBody, body);
      t.equal(mockedResponse.headers['content-encoding'], 'gzip');

      _.each(nocks, function(nock) {
        nock.done();
      });

      t.end();
    });
  });
});

test('records and replays nocks correctly', function(t) {
  const server = http.createServer((request, response) => {
    switch (require('url').parse(request.url).pathname) {
      case '/':
        response.writeHead(302, {Location: '/abc'});
        break;
      case '/abc':
        response.write('<html><body>example</body></html>');
        break;
    }
    response.end();
  });
  t.once('end', () => server.close());

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  server.listen(() => {
    nock.recorder.rec({
      dont_print: true,
      output_objects: true
    });

    mikealRequest(`http://localhost:${server.address().port}`, (err, resp, body) => {
      t.notOk(err);
      t.ok(resp);
      t.ok(body);

      nock.restore();
      const recorded = nock.recorder.play();
      nock.recorder.clear();
      nock.activate();

      // Two requests, on account of the redirect.
      t.equal(recorded.length, 2);
      const nocks = nock.define(recorded);

      mikealRequest(`http://localhost:${server.address().port}`, (mockedErr, mockedResp, mockedBody) => {
        t.notOk(mockedErr);
        t.equal(body, mockedBody);

        nocks.forEach(nock => nock.done());

        t.end();
      });
    });
  });
});

test("doesn't record request headers by default", function(t) {
  const server = http.createServer((request, response) => {
    response.writeHead(200)
    response.end()
  });
  t.once('end', () => server.close());

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  server.listen(() => {
    nock.recorder.rec({
      dont_print: true,
      output_objects: true
    });

    http.request(
      {
        hostname: 'www.example.com',
        path: '/',
        method: 'GET',
        auth: 'foo:bar'
      },
      function(res) {
        res.resume();
        res.once('end', function() {
          nock.restore();
          var ret = nock.recorder.play();
          t.equal(ret.length, 1);
          ret = ret[0];
          t.type(ret, 'object');
          t.false(ret.reqheaders);
          t.end();
        });
      }
    ).end();
  });
});

test('will call a custom logging function', function(t) {
  const server = http.createServer((request, response) => {
    response.writeHead(200)
    response.end()
  });
  t.once('end', () => server.close());

  // This also tests that use_separator is on by default.
  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  const record = [];
  const arrayLog = function(content) {
    record.push(content);
  }

  server.listen(() => {
    nock.recorder.rec({
      logging: arrayLog
    });

    http.request(
      {
        hostname: 'localhost',
        port: server.address().port,
        path: '/',
        method: 'GET',
        auth: 'foo:bar'
      },
      function(res) {
        res.resume();
        res.once('end', function() {
          nock.restore();

          t.equal(record.length, 1)
          var ret = record[0]
          t.type(ret, 'string');
          t.end();
        });
      }
    ).end();
  });
});

test('use_separator:false is respected', function(t) {
  const server = http.createServer((request, response) => {
    response.writeHead(200)
    response.end()
  });
  t.once('end', () => server.close());

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  var record = [];
  var arrayLog = function(content) {
    record.push(content);
  }

  server.listen(() => {
    nock.recorder.rec({
      logging: arrayLog,
      output_objects: true,
      use_separator: false,
    });

    http.request(
      {
        hostname: 'localhost',
        port: server.address().port,
        path: '/',
        method: 'GET',
        auth: 'foo:bar'
      },
      function(res) {
        res.resume();
        res.once('end', function() {
          nock.restore();
          t.equal(record.length, 1)
          var ret = record[0];
          t.type(ret, 'object'); // this is still an object, because the "cut here" strings have not been appended
          t.end();
        });
      }
    ).end();
  });
});

test('records request headers except user-agent if enable_reqheaders_recording is set to true', function(t) {
  const server = http.createServer((request, response) => {
    response.writeHead(200)
    response.end()
  });
  t.once('end', () => server.close());

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  server.listen(() => {
    nock.recorder.rec({
      dont_print: true,
      output_objects: true,
      enable_reqheaders_recording: true
    });

    http.request({
        hostname: 'localhost',
        port: server.address().port,
        path: '/',
        method: 'GET',
        auth: 'foo:bar'
      }, function(res) {
        res.resume();
        res.once('end', function() {
          nock.restore();
          var ret = nock.recorder.play();
          t.equal(ret.length, 1);
          ret = ret[0];
          t.type(ret, 'object');
          t.true(ret.reqheaders);
          t.false(ret.reqheaders['user-agent']);
          t.end();
        });
      }
    ).end();
  });
});

test('includes query parameters from superagent', function(t) {
  const server = http.createServer((request, response) => {
    response.writeHead(200)
    response.end()
  });
  t.once('end', () => server.close());

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  server.listen(() => {
    nock.recorder.rec({
      dont_print: true,
      output_objects: true
    });

    superagent.get(`http://localhost:${server.address().port}`)
      .query({q: 'test search' })
      .end(function(res) {
        nock.restore();
        var ret = nock.recorder.play();
        t.true(ret.length >= 1);
        t.equal(ret[0].path, '/?q=test%20search');
        t.end();
      });
  });
});

test('encodes the query parameters when not outputing objects', function(t) {
  const server = http.createServer((request, response) => {
    response.writeHead(200)
    response.end()
  });
  t.once('end', () => server.close());

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  server.listen(() => {
    nock.recorder.rec({
      dont_print: true,
      output_objects: false
    });

    superagent.get(`http://localhost:${server.address().port}`)
      .query({q: 'test search++' })
      .end(function(res) {
        nock.restore();
        var recording = nock.recorder.play();
        t.true(recording.length >= 1);
        t.true(recording[0].indexOf('test%20search%2B%2B') !== -1);
        t.end();
      });
  });
});

test('works with clients listening for readable', function(t) {
  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);
  t.once('end', () => nock.restore())

  const requestBody = 'ABCDEF';
  const responseBody = '012345';

  const server = http.createServer((req, res) => {
    res.end(responseBody);
  });
  t.once('end', () => server.close());

  server.listen(() => {
    nock.recorder.rec({ dont_print: true, output_objects: true });

    http.request(
      {
        host: 'localhost',
        port: server.address().port,
        path: '/',
      },
      res => {
        let readableCount = 0;
        let chunkCount = 0;

        res.on('readable', () => {
          ++readableCount;
          let chunk
          while (null !== (chunk = res.read())) {
            t.equal(chunk.toString(), responseBody);
            ++chunkCount;
          }
        });

        res.once('end', function() {
          t.equal(readableCount, 1);
          t.equal(chunkCount, 1);

          const recorded = nock.recorder.play();
          t.equal(recorded.length, 1);
          t.type(recorded[0], 'object');
          t.equal(recorded[0].scope, `http://localhost:${server.address().port}`);
          t.equal(recorded[0].method, "GET");
          t.equal(recorded[0].body, requestBody);
          t.equal(recorded[0].status, 200);
          t.equal(recorded[0].response, responseBody);

          t.end();
        });
      }).end(requestBody)
  });
});

test('outputs query string parameters using query()', function(t) {
  t.plan(7);

  const server = http.createServer((request, response) => {
    response.writeHead(200)
    response.end()
  });
  t.once('end', () => server.close());

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  server.listen(() => {
    nock.recorder.rec(true);

    superagent
      .get(`http://localhost:${server.address().port}/`)
      .query({param1: 1, param2: 2})
      .end((err, resp) => {
        t.notOk(err)
        t.ok(resp, 'have response');
        t.ok(resp.headers, 'have headers');

        const recorded = nock.recorder.play();
        t.equal(recorded.length, 1);
        t.type(recorded[0], 'string');
        t.ok(recorded[0].includes(`.query({"param1":"1","param2":"2"})`))
        t.end();
      });
  });
});

test('outputs query string arrays correctly', function(t) {
  t.plan(7);

  const server = http.createServer((request, response) => {
    response.writeHead(200)
    response.end()
  });
  t.once('end', () => server.close());

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);

  server.listen(() => {
    nock.recorder.rec(true);

    superagent
      .get(`http://localhost:${server.address().port}/`)
      .query({'foo': ['bar', 'baz']})
      .end((err, resp) => {
        t.notOk(err)
        t.ok(resp, 'have response');
        t.ok(resp.headers, 'have headers');

        const recorded = nock.recorder.play();
        t.equal(recorded.length, 1);
        t.type(recorded[0], 'string');
        t.ok(recorded[0].includes(`.query({"foo":["bar","baz"]})`))
        t.end();
      });
  })
});

test('removes query params from the path and puts them in query()', function(t) {
  t.plan(5);

  const server = http.createServer((request, response) => {
    response.writeHead(200)
    response.end()
  });
  t.once('end', () => server.close());

  nock.restore();
  nock.recorder.clear();
  t.equal(nock.recorder.play().length, 0);
  t.once('end', () => nock.restore());

  server.listen(() => {
    nock.recorder.rec(true);
    http.request(
      {
        method: 'POST',
        host: 'localhost',
        port: server.address().port,
        path: '/?param1=1&param2=2',
      },
      res => {
        res.resume();
        res.once('end', () => {
          const recorded = nock.recorder.play();
          t.equal(recorded.length, 1);
          t.type(recorded[0], 'string');
          t.ok(recorded[0].includes(`nock('http://localhost:${server.address().port}',`))
          t.ok(recorded[0].includes(`.query({"param1":"1","param2":"2"})`))
          t.end();
        });
      }).end('ABCDEF')
  });
});

test("respects http.request() consumers", function(t) {
  //  Create test http server and perform the tests while it's up.
  var testServer = http.createServer(function(req, res) {
    res.write('foo');
    setTimeout(function() {
      res.end('bar');
    }, 25);
  }).listen(8083, function(err) {
    t.equal(err, undefined);

    nock.restore();
    nock.recorder.clear();
    nock.recorder.rec({
      dont_print: true,
      output_objects: true
    });


    var options = { host:'localhost'
                  , port:testServer.address().port
                  , path:'/' }
    ;
    var req = http.request(options, function (res) {
      var buffer = Buffer.from('');

      setTimeout(function () {
        res
          .on('data', function(data) {
            buffer = Buffer.concat([buffer, data]);
          })
          .on('end', function() {
            nock.restore();
            t.equal(buffer.toString(), 'foobar');
            t.end();

            //  Close the test server, we are done with it.
            testServer.close();
          });
      });
    }, 50);

    req.end();
  });
});

test('records and replays binary response correctly', (t) => {
  nock.restore()
  nock.recorder.clear()
  t.equal(nock.recorder.play().length, 0)

  nock.recorder.rec({
    output_objects: true,
    dont_print: true
  })

  const transparentGifHex = '47494638396101000100800000000000ffffff21f90401000000002c000000000100010000020144003b'
  const transparentGifBuffer = Buffer.from(transparentGifHex, 'hex')

  // start server that always respondes with transparent gif at available port
  const server = http.createServer(function (request, response) {
    response.writeHead(201, {
      'Content-Type': 'image/gif',
      'Content-Length': transparentGifBuffer.length
    })
    response.write(transparentGifBuffer, 'binary')
    response.end()
  })

  server.listen(0, (error) => {
    t.error(error)

    // send post request upload the same image to server
    const postRequestOptions = {
      method: 'PUT',
      host: 'localhost',
      port: server.address().port,
      path: '/clear.gif',
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': transparentGifBuffer.length
      }
    }
    const postRequest1 = http.request(postRequestOptions, function (response) {
      var data = []

      response.on('data', function (chunk) {
        data.push(chunk)
      })

      response.on('end', function () {
        const result = Buffer.concat(data).toString('hex')
        t.equal(result, transparentGifHex, 'received gif equals check value')

        const recordedFixtures = nock.recorder.play()

        // stope server, stope recording, start intercepting
        server.close((error) => {
          t.error(error)

          nock.restore()
          nock.activate()
          nock.define(recordedFixtures)

          // send same post request again
          const postRequest2 = http.request(postRequestOptions, function (response) {
            var data = []

            response.on('data', function (chunk) {
              data.push(chunk)
            })

            response.on('end', function () {
              const result = Buffer.concat(data).toString('hex')

              // expect same outcome, end tests
              t.equal(result, transparentGifHex, 'received gif equals check value')
              t.end()
            })
          })

          postRequest2.write(transparentGifBuffer)
          postRequest2.end()
        })
      })
    })

    postRequest1.write(transparentGifBuffer)
    postRequest1.end()
  })
})

test("teardown", function(t) {
  var leaks = Object.keys(global)
    .splice(globalCount, Number.MAX_VALUE);

  if (leaks.length == 1 && leaks[0] == '_key') {
    leaks = [];
  }
  t.deepEqual(leaks, [], 'No leaks');
  t.end();
});
