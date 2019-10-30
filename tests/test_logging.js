'use strict'

const debug = require('debug')
const sinon = require('sinon')
const { test } = require('tap')
const { expect } = require('chai')
const nock = require('..')
const got = require('./got_client')

require('./cleanup_after_each')()
require('./setup')

test('match debugging works', async t => {
  const logFn = sinon.stub(debug, 'log')
  debug.enable('nock.interceptor')
  t.once('end', () => {
    debug.disable('nock.interceptor')
  })

  nock('http://example.test')
    .post('/deep/link')
    .reply(200, 'Hello World!')

  const exampleBody = 'Hello yourself!'
  await got.post('http://example.test/deep/link', { body: exampleBody })

  expect(logFn).to.have.been.calledWithExactly(
    sinon.match.string,
    sinon.match('http://example.test/deep/link'),
    sinon.match(exampleBody)
  )
})

test('should log matching', async t => {
  const logFn = sinon.spy()

  const scope = nock('http://example.test')
    .get('/')
    .reply(200, 'Hello, World!')
    .log(logFn)

  await got('http://example.test/')

  expect(logFn).to.have.been.calledOnceWithExactly(
    'matching http://example.test:80/ to GET http://example.test:80/: true'
  )

  scope.done()
})
