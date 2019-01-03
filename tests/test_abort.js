'use strict'

const nock = require('../.')
const http = require('http')
const { test } = require('tap')

test('[actual] req.abort() should cause "abort" and "error" to be emitted', t => {
  nock('http://localhost:16829')
    .get('/status')
    .delayConnection(500)
    .reply(204)

  let gotAbort = false
  const req = http
    .get('http://localhost:16829/status')
    .once('abort', () => {
      // Should trigger first
      gotAbort = true
    })
    .once('error', err => {
      // Should trigger last
      t.equal(err.code, 'ECONNRESET')
      t.ok(gotAbort, "didn't get abort event")
      t.end()
    })
  process.nextTick(() => req.abort())
})

test('abort is emitted before delay time', t => {
  nock('http://test.example.com')
    .get('/status')
    .delayConnection(500)
    .reply(204)

  const tstart = Date.now()
  const req = http
    .get('http://test.example.com/status')
    .once('abort', () => {
      const actual = Date.now() - tstart
      t.ok(actual < 250, `abort took only ${actual} ms`)
      t.end()
    })
    .once('error', () => {}) // Don't care.
  // Don't bother with the response

  setTimeout(() => req.abort(), 10)
})

test('Aborting an aborted request should not emit an error', t => {
  nock('http://test.example.com')
    .get('/status')
    .reply(200)

  let errorCount = 0
  const req = http.get('http://test.example.com/status').on('error', err => {
    errorCount++
    if (errorCount < 3) {
      // Abort 3 times at max, otherwise this would be an endless loop,
      // if #882 pops up again.
      req.abort()
    }
  })
  req.abort()

  // Allow some time to fail.
  setTimeout(() => {
    t.equal(errorCount, 1, 'Only one error should be sent.')
    t.end()
  }, 10)
})
