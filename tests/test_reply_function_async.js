'use strict'

// Tests for invoking `.reply()` with a function which invokes the error-first
// callback with the response body or an array containing the status code and
// optional response body and headers.

const http = require('http')
const { test } = require('tap')
const got = require('got')
const nock = require('..')

require('./cleanup_after_each')()

test('reply takes a callback for status code', async t => {
  const expectedStatusCode = 202
  const responseBody = 'Hello, world!'
  const headers = {
    'X-Custom-Header': 'abcdef',
  }

  const scope = nock('http://example.com')
    .get('/')
    .reply((path, requestBody, cb) => {
      setTimeout(() => cb(null, [expectedStatusCode, responseBody, headers]), 1)
    })

  const response = await got('http://example.com/')

  t.equal(response.statusCode, expectedStatusCode, 'sends status code')
  t.deepEqual(response.headers, headers, 'sends headers')
  t.equal(response.body, responseBody, 'sends request body')
  scope.done()
})

test('reply should throw on error on the callback', t => {
  let dataCalled = false

  const scope = nock('http://example.com')
    .get('/')
    .reply(500, (path, requestBody, callback) =>
      callback(new Error('Database failed'))
    )

  // TODO When this request is converted to `got`, it causes the request not
  // to match.
  const req = http.request(
    {
      host: 'example.com',
      path: '/',
      port: 80,
    },
    res => {
      t.equal(res.statusCode, 500, 'Status code is 500')

      res.on('data', data => {
        dataCalled = true
        t.ok(data instanceof Buffer, 'data should be buffer')
        t.ok(
          data.toString().indexOf('Error: Database failed') === 0,
          'response should match'
        )
      })

      res.on('end', () => {
        t.ok(dataCalled, 'data handler was called')
        scope.done()
        t.end()
      })
    }
  )

  req.end()
})
