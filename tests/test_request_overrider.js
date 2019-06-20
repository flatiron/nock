'use strict'

// Tests of the RequestOverrider, which mocks http.ClientRequest and
// https.ClientRequest. The goal is to provide parity of behavior, both
// documented and undocumented, with the real version.
//
// While most of nock's tests are functional tests which invoke Nock's public
// API and make assertions about requests, usually with got, the tests of the
// request overrider tend to use http directly, and make lower-level
// assertions about how the mock client responds. Here the code under test is
// the part of Nock that must interface with all http clients.

const http = require('http')
const { URL } = require('url')
const { test } = require('tap')
const needle = require('needle')
const nock = require('..')

test('response is an http.IncomingMessage instance', t => {
  const responseText = 'incoming message!'
  const scope = nock('http://example.test')
    .get('/somepath')
    .reply(200, responseText)

  http
    .request(
      {
        host: 'example.test',
        path: '/somepath',
      },
      res => {
        res.resume()
        t.type(res, http.IncomingMessage)
        scope.done()
        t.end()
      }
    )
    .end()
})

test('write callback called', t => {
  const scope = nock('http://filterboddiezregexp.com')
    .filteringRequestBody(/mia/, 'nostra')
    .post('/', 'mamma nostra')
    .reply(200, 'Hello World!')

  let callbackCalled = false
  const req = http.request(
    {
      host: 'filterboddiezregexp.com',
      method: 'POST',
      path: '/',
      port: 80,
    },
    res => {
      t.equal(callbackCalled, true)
      t.is(res.statusCode, 200)
      res.on('end', () => {
        scope.done()
        t.end()
      })
      // Streams start in 'paused' mode and must be started.
      // See https://nodejs.org/api/stream.html#stream_class_stream_readable
      res.resume()
    }
  )

  req.write('mamma mia', null, () => {
    callbackCalled = true
    req.end()
  })
})

test('end callback called', t => {
  const scope = nock('http://example.test')
    .filteringRequestBody(/mia/, 'nostra')
    .post('/', 'mamma nostra')
    .reply(200, 'Hello World!')

  let callbackCalled = false
  const req = http.request(
    {
      host: 'example.test',
      method: 'POST',
      path: '/',
      port: 80,
    },
    res => {
      t.true(callbackCalled)
      t.equal(res.statusCode, 200)
      res.on('end', () => {
        scope.done()
        t.end()
      })
      // Streams start in 'paused' mode and must be started.
      // See https://nodejs.org/api/stream.html#stream_class_stream_readable
      res.resume()
    }
  )

  req.end('mamma mia', null, () => {
    callbackCalled = true
  })
})

// https://github.com/nock/nock/issues/1509
test('end callback called when end has callback, but no buffer', t => {
  const scope = nock('http://example.test')
    .post('/')
    .reply(200, 'Hello World!')

  let callbackCalled = false
  const req = http.request(
    {
      host: 'example.test',
      method: 'POST',
      path: '/',
      port: 80,
    },
    res => {
      t.true(callbackCalled)
      t.is(res.statusCode, 200)
      res.on('end', () => {
        scope.done()
        t.end()
      })
      // Streams start in 'paused' mode and must be started.
      // See https://nodejs.org/api/stream.html#stream_class_stream_readable
      res.resume()
    }
  )

  req.end(() => {
    callbackCalled = true
  })
})

// http://github.com/nock/nock/issues/139
test('finish event fired before end event', t => {
  const scope = nock('http://example.test')
    .filteringRequestBody(/mia/, 'nostra')
    .post('/', 'mamma nostra')
    .reply(200, 'Hello World!')

  let finishCalled = false
  const req = http.request(
    {
      host: 'example.test',
      method: 'POST',
      path: '/',
      port: 80,
    },
    res => {
      t.true(finishCalled)
      t.is(res.statusCode, 200)
      res.on('end', () => {
        scope.done()
        t.end()
      })
      // Streams start in 'paused' mode and must be started.
      // See https://nodejs.org/api/stream.html#stream_class_stream_readable
      res.resume()
    }
  )

  req.on('finish', () => {
    finishCalled = true
  })

  req.end('mamma mia')
})

// TODO Convert to async / got.
test('pause response before data', t => {
  const scope = nock('http://example.test')
    .get('/pauser')
    .reply(200, 'nobody')

  const req = http.request({
    host: 'example.test',
    path: '/pauser',
  })

  req.on('response', res => {
    res.pause()

    let waited = false
    setTimeout(() => {
      waited = true
      res.resume()
    }, 500)

    res.on('data', data => t.true(waited))

    res.on('end', () => {
      scope.done()
      t.end()
    })
  })

  req.end()
})

test('accept URL as request target', t => {
  let dataCalled = false
  const scope = nock('http://example.test')
    .get('/')
    .reply(200, 'Hello World!')

  http.get(new URL('http://example.test'), res => {
    t.is(res.statusCode, 200)

    res.on('data', data => {
      dataCalled = true
      t.type(data, Buffer)
      t.equal(data.toString(), 'Hello World!', 'response should match')
    })

    res.on('end', () => {
      t.ok(dataCalled)
      scope.done()
      t.end()
    })
  })
})

test('request has path', t => {
  const scope = nock('http://example.test')
    .get('/the/path/to/infinity')
    .reply(200)

  const req = http.request(
    {
      hostname: 'example.test',
      port: 80,
      method: 'GET',
      path: '/the/path/to/infinity',
    },
    res => {
      scope.done()
      t.equal(
        req.path,
        '/the/path/to/infinity',
        'should have req.path set to /the/path/to/infinity'
      )
      t.end()
    }
  )
  req.end()
})

test('has a req property on the response', t => {
  const scope = nock('http://example.test')
    .get('/like-wtf')
    .reply(200)

  const req = http.request('http://example.test/like-wtf', res => {
    res.on('end', () => {
      t.ok(res.req, "req property doesn't exist")
      scope.done()
      t.end()
    })
    // Streams start in 'paused' mode and must be started.
    // See https://nodejs.org/api/stream.html#stream_class_stream_readable
    res.resume()
  })
  req.end()
})

// https://github.com/nock/nock/issues/146
// TODO: This looks like an integration-related regression test, and should
// be rewritten to test the root cause of the original bug, without use of the
// needle library.
test('resume() is automatically invoked when the response is drained', t => {
  const replyLength = 1024 * 1024
  const replyBuffer = Buffer.from(new Array(replyLength + 1).join('.'))
  t.equal(replyBuffer.length, replyLength)

  nock('http://example.test')
    .get('/abc')
    .reply(200, replyBuffer)

  needle.get('http://example.test/abc', (err, res, buffer) => {
    t.notOk(err)
    t.ok(res)
    t.ok(buffer)
    t.same(buffer, replyBuffer)
    t.end()
  })
})

test('.setNoDelay', t => {
  nock('http://example.test')
    .get('/yay')
    .reply(200, 'Hi')

  const req = http.request(
    {
      host: 'example.test',
      path: '/yay',
      port: 80,
    },
    res => {
      t.is(res.statusCode, 200)
      res.on('end', () => t.end())
      // Streams start in 'paused' mode and must be started.
      // See https://nodejs.org/api/stream.html#stream_class_stream_readable
      res.resume()
    }
  )

  req.setNoDelay(true)

  req.end()
})

test('request emits socket', t => {
  nock('http://example.test')
    .get('/')
    .reply(200, 'hey')

  const req = http.get('http://example.test')
  // Using `this`, so can't use arrow function.
  req.once('socket', function(socket) {
    t.equal(this, req)
    t.type(socket, Object)
    t.type(socket.getPeerCertificate(), 'string')
    t.end()
  })
})

test('socket is shared and aliased correctly', t => {
  nock('http://example.test')
    .get('/')
    .reply()

  const req = http.get('http://example.test')

  req.once('response', res => {
    t.is(req.socket, req.connection)
    t.is(req.socket, res.socket)
    t.is(res.socket, res.connection)
    t.end()
  })
})

test('socket emits connect and secureConnect', t => {
  t.plan(3)

  nock('http://example.test')
    .post('/')
    .reply(200, 'hey')

  const req = http.request({
    host: 'example.test',
    path: '/',
    method: 'POST',
  })

  req.on('socket', socket => {
    socket.once('connect', () => {
      req.end()
      t.ok(true)
    })
    socket.once('secureConnect', () => {
      t.ok(true)
    })
  })

  req.once('response', res => {
    res.setEncoding('utf8')
    res.on('data', d => {
      t.equal(d, 'hey')
    })
  })
})

test('socket setKeepAlive', t => {
  nock('http://example.test')
    .get('/')
    .reply(200, 'hey')

  const req = http.get('http://example.test')
  req.once('socket', socket => {
    socket.setKeepAlive(true)
    t.end()
  })
})

test('abort destroys socket', t => {
  nock('http://example.test')
    .get('/')
    .reply(200, 'hey')

  const req = http.get('http://example.test')
  // Ignore errors.
  req.once('error', () => {})
  req.once('socket', socket => {
    req.abort()
    t.true(socket.destroyed)
    t.end()
  })
})

test('should throw expected error when creating request with missing options', t => {
  t.throws(() => http.request(), {
    message: 'Making a request with empty `options` is not supported in Nock',
  })
  t.end()
})

// https://github.com/nock/nock/issues/1558
test("mocked requests have 'method' property", t => {
  const scope = nock('http://example.test')
    .get('/somepath')
    .reply(200, {})

  const req = http.request({
    host: 'example.test',
    path: '/somepath',
    method: 'GET',
    port: 80,
  })
  t.equal(req.method, 'GET')
  req.on('response', function(res) {
    t.equal(res.req.method, 'GET')
    scope.done()
    t.end()
  })
  req.end()
})
