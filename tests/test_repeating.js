'use strict'

const { test } = require('tap')
const { expect } = require('chai')
const nock = require('..')
const got = require('./got_client')
const assertRejects = require('assert-rejects')

require('./cleanup_after_each')()
require('./setup')

test('repeating once', async t => {
  const scope = nock('http://example.test')
    .get('/')
    .once()
    .reply(200, 'Hello World!')

  const { statusCode } = await got('http://example.test/')
  expect(statusCode).to.equal(200)

  await assertRejects(
    got('http://example.test/'),
    Error,
    'Nock: No match for request'
  )

  scope.done()
})

test('repeating twice', async t => {
  const scope = nock('http://example.test')
    .get('/')
    .twice()
    .reply(200, 'Hello World!')

  // eslint-disable-next-line no-unused-vars
  for (const _ of Array(2)) {
    const { statusCode } = await got('http://example.test/')
    expect(statusCode).to.equal(200)
  }

  await assertRejects(
    got('http://example.test/'),
    Error,
    'Nock: No match for request'
  )

  scope.done()
})

test('repeating thrice', async t => {
  const scope = nock('http://example.test')
    .get('/')
    .thrice()
    .reply(200, 'Hello World!')

  // eslint-disable-next-line no-unused-vars
  for (const _ of Array(3)) {
    const { statusCode } = await got('http://example.test/')
    expect(statusCode).to.equal(200)
  }

  await assertRejects(
    got('http://example.test/'),
    Error,
    'Nock: No match for request'
  )

  scope.done()
})

test('repeating response 4 times', async t => {
  const scope = nock('http://example.test')
    .get('/')
    .times(4)
    .reply(200, 'Hello World!')

  // eslint-disable-next-line no-unused-vars
  for (const _ of Array(4)) {
    const { statusCode } = await got('http://example.test/')
    expect(statusCode).to.equal(200)
  }

  await assertRejects(
    got('http://example.test/'),
    Error,
    'Nock: No match for request'
  )

  scope.done()
})

test('times with invalid argument is ignored', async t => {
  const scope = nock('http://example.test')
    .get('/')
    .times(0)
    .reply(200, 'Hello World!')

  const { statusCode } = await got('http://example.test/')
  expect(statusCode).to.equal(200)

  await assertRejects(
    got('http://example.test/'),
    Error,
    'Nock: No match for request'
  )

  scope.done()
})

test('isDone() must consider repeated responses', async t => {
  const scope = nock('http://example.test')
    .get('/')
    .times(2)
    .reply(204)

  // eslint-disable-next-line no-unused-vars
  for (const _ of Array(2)) {
    expect(scope.isDone()).to.be.false()
    await got('http://example.test/')
  }
  expect(scope.isDone()).to.be.true()
})
