'use strict'

const nock = require('../.')
const { test } = require('tap')
const request = require('request')
const lolex = require('lolex')

// https://github.com/nock/nock/issues/1334
test('one function returns successfully when fake timer is enabled', function(t) {
  const clock = lolex.install()
  nock('http://www.google.com')
    .get('/')
    .reply(200)

  request.get('http://www.google.com', function(err, resp) {
    clock.uninstall()
    if (err) {
      throw err
    }
    t.equal(resp.statusCode, 200)
    t.end()
  })
})
