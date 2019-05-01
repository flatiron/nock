'use strict'

// Tests for invoking `.reply()` with a synchronous function which return the
// response body or an array containing the status code and optional response
// body and headers.

const http = require('http')
const assertRejects = require('assert-rejects')
const { test } = require('tap')
const got = require('got')
const nock = require('..')

require('./cleanup_after_each')()

test('reply with status code and function returning body as string', async t => {
  const scope = nock('http://example.com')
    .get('/')
    .reply(200, () => 'OK!')

  const { body } = await got('http://example.com')
  t.equal(body, 'OK!')
  scope.done()
})

test('reply with status code and function returning body object', async t => {
  const exampleResponse = { message: 'OK!' }

  const scope = nock('http://example.test')
    .get('/')
    .reply(200, () => exampleResponse)

  const { body } = await got('http://example.test')
  t.equal(body, JSON.stringify(exampleResponse))
  scope.done()
})

test('reply with status code and function returning body as number', async t => {
  const scope = nock('http://example.test')
    .get('/')
    .reply(200, () => 123)

  const { body } = await got('http://example.test')
  t.equal(body, '123')
  scope.done()
})

// The observed behavior is that this returns a 123 status code.
//
// The expected behavior is that this should either throw an error or reply
// with 200 and the JSON-stringified '[123]'.
test(
  'reply with status code and function returning array',
  { skip: true },
  async t => {
    const scope = nock('http://example.test')
      .get('/')
      .reply(200, () => [123])

    const { body } = await got('http://example.test')
    t.equal(body, '[123]')
    scope.done()
  }
)

test('reply function with string body using POST', async t => {
  const exampleRequestBody = 'key=val'
  const exampleResponseBody = 'foo'

  const scope = nock('http://example.test')
    .post('/endpoint', exampleRequestBody)
    .reply(404, () => exampleResponseBody)

  await assertRejects(
    got.post('http://example.test/endpoint', {
      body: exampleRequestBody,
    }),
    ({ statusCode, body }) => {
      t.equal(statusCode, 404)
      t.equal(body, exampleResponseBody)
      return true
    }
  )
  scope.done()
})

test('reply function receives the request URL and body', async t => {
  t.plan(3)

  const exampleRequestBody = 'key=val'

  const scope = nock('http://example.test')
    .post('/endpoint', exampleRequestBody)
    .reply(404, (uri, requestBody) => {
      t.equal(uri, '/endpoint')
      t.equal(requestBody, exampleRequestBody)
    })

  await assertRejects(
    got('http://example.test/endpoint', {
      body: exampleRequestBody,
    }),
    ({ statusCode, body }) => {
      t.equal(statusCode, 404)
      return true
    }
  )
  scope.done()
})

test('when content-type is json, reply function receives parsed body', async t => {
  t.plan(3)
  const exampleRequestBody = JSON.stringify({ id: 1, name: 'bob' })

  const scope = nock('http://example.test')
    .post('/')
    .reply(200, (uri, requestBody) => {
      t.type(requestBody, 'object')
      t.deepEqual(requestBody, JSON.parse(exampleRequestBody))
    })

  const { statusCode } = await got('http://example.test/', {
    headers: { 'Content-Type': 'application/json' },
    body: exampleRequestBody,
  })
  t.is(statusCode, 200)
  scope.done()
})

test('without content-type header, body sent to reply function is not parsed', async t => {
  t.plan(3)
  const exampleRequestBody = JSON.stringify({ id: 1, name: 'bob' })

  const scope = nock('http://example.test')
    .post('/')
    .reply(200, (uri, requestBody) => {
      t.type(requestBody, 'string')
      t.equal(requestBody, exampleRequestBody)
    })

  const { statusCode } = await got.post('http://example.test/', {
    body: exampleRequestBody,
  })
  t.is(statusCode, 200)
  scope.done()
})

// This signature is supported today, however it seems unnecessary. This is
// just as easily accomplished with a function returning an array:
// `.reply(() => [200, 'ABC', { 'X-My-Headers': 'My custom header value' }])`
test('reply with status code, function returning string body, and header object', async t => {
  const scope = nock('http://example.com')
    .get('/')
    .reply(200, () => 'ABC', { 'X-My-Headers': 'My custom header value' })

  const { headers } = await got('http://example.com/')

  t.equivalent(headers, { 'x-my-headers': 'My custom header value' })

  scope.done()
})

test(
  'reply function returning array with status code',
  // Seems likely a bug related to https://github.com/nock/nock/issues/1222.
  { skip: true },
  async t => {
    const scope = nock('http://example.test')
      .get('/')
      .reply(() => [202])

    const { statusCode, body } = await got('http://example.test/')

    t.is(statusCode, 202)
    t.equal(body, '')
    scope.done()
  }
)

test('reply function returning array with status code and string body', async t => {
  const scope = nock('http://example.com')
    .get('/')
    .reply(() => [401, 'This is a body'])

  await assertRejects(got('http://example.com/'), err => {
    t.equal(err.statusCode, 401)
    t.equal(err.body, 'This is a body')
    return true
  })
  scope.done()
})

test('reply function returning array with status code and body object', async t => {
  const exampleResponse = { message: 'OK!' }

  const scope = nock('http://example.test')
    .get('/')
    .reply(() => [202, exampleResponse])

  const { statusCode, body } = await got('http://example.test/')

  t.is(statusCode, 202)
  t.equal(body, JSON.stringify(exampleResponse))
  scope.done()
})

test('reply function returning array with status code and body as number', async t => {
  const scope = nock('http://example.test')
    .get('/')
    .reply(() => [202, 123])

  const { statusCode, body } = await got('http://example.test/')

  t.is(statusCode, 202)
  t.type(body, 'string')
  t.equal(body, '123')
  scope.done()
})

test('reply function returning array with status code, string body, and headers object', async t => {
  const scope = nock('http://example.test')
    .get('/')
    .reply(() => [202, 'body', { 'x-key': 'value', 'x-key-2': 'value 2' }])

  const { headers, rawHeaders } = await got('http://example.test/')

  t.deepEqual(headers, {
    'x-key': 'value',
    'x-key-2': 'value 2',
  })
  t.deepEqual(rawHeaders, ['x-key', 'value', 'x-key-2', 'value 2'])
  scope.done()
})
