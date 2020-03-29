'use strict'

const { expect } = require('chai')
const http = require('http')
const sinon = require('sinon')
const nock = require('..')

require('./setup')

// These tests use `setTimeout` before verifying emitted events to ensure any
// number of `nextTicks` or `setImmediate` can process first.

// Node will emit a `prefinish` event after `socket`, but it's an internal,
// undocumented event that Nock does not emulate.

// The order of tests run sequentially through a ClientRequest's lifetime.
// Starting the top by aborting requests early on then aborting later and later.
describe('`ClientRequest.abort()`', () => {
  it('should not emit an error when `write` is called on an aborted request', done => {
    const scope = nock('http://example.test').get('/').reply()

    const req = http.request('http://example.test')
    const emitSpy = sinon.spy(req, 'emit')
    req.abort()
    req.write('foo')

    setTimeout(() => {
      expect(emitSpy).to.have.been.calledOnceWithExactly('abort')
      expect(scope.isDone()).to.be.false()
      done()
    }, 10)
  })

  it('should not emit an error when `end` is called on an aborted request', done => {
    const scope = nock('http://example.test').get('/').reply()

    const req = http.request('http://example.test')
    const emitSpy = sinon.spy(req, 'emit')
    req.abort()
    req.end()

    setTimeout(() => {
      expect(emitSpy).to.have.been.calledOnceWithExactly('abort')
      expect(scope.isDone()).to.be.false()
      done()
    }, 10)
  })

  it('should not emit an error when `flushHeaders` is called on an aborted request', done => {
    const scope = nock('http://example.test').get('/').reply()

    const req = http.request('http://example.test')
    const emitSpy = sinon.spy(req, 'emit')
    req.abort()
    req.flushHeaders()

    setTimeout(() => {
      expect(emitSpy).to.have.been.calledOnceWithExactly('abort')
      expect(scope.isDone()).to.be.false()
      done()
    }, 10)
  })

  it('should not emit an error when called immediately after `end`', done => {
    const scope = nock('http://example.test').get('/').reply()

    const req = http.request('http://example.test')
    const emitSpy = sinon.spy(req, 'emit')
    req.end()
    req.abort()

    setTimeout(() => {
      expect(emitSpy).to.have.been.calledOnceWithExactly('abort')
      expect(scope.isDone()).to.be.false()
      done()
    }, 10)
  })

  it('should emit an ECONNRESET error when aborted inside a `socket` event listener', done => {
    const scope = nock('http://example.test').get('/').reply()

    const req = http.request('http://example.test')
    const emitSpy = sinon.spy(req, 'emit')

    req.on('socket', () => {
      req.abort()
    })
    req.on('error', err => {
      expect(err.message).to.equal('socket hang up')
      expect(err.code).to.equal('ECONNRESET')
    })
    req.end()

    setTimeout(() => {
      const events = emitSpy.args.map(i => i[0])
      expect(events).to.deep.equal(['socket', 'abort', 'error', 'close'])
      expect(scope.isDone()).to.be.false()
      done()
    }, 10)
  })

  it('should only emit `abort` and `error` events once if aborted multiple times', done => {
    const scope = nock('http://example.test').get('/').reply()

    const req = http.request('http://example.test')
    const emitSpy = sinon.spy(req, 'emit')

    req.on('error', () => {}) // listen for error so it doesn't bubble
    req.on('socket', () => {
      req.abort()
      req.abort()
      req.abort()
    })
    req.end()

    setTimeout(() => {
      const events = emitSpy.args.map(i => i[0])
      expect(events).to.deep.equal(['socket', 'abort', 'error', 'close'])
      expect(scope.isDone()).to.be.false()
      done()
    }, 10)
  })

  it('should emit an ECONNRESET error when aborted inside a `finish` event listener', done => {
    const scope = nock('http://example.test').get('/').reply()

    const req = http.request('http://example.test')
    const emitSpy = sinon.spy(req, 'emit')

    req.on('finish', () => {
      req.abort()
    })
    req.on('error', err => {
      expect(err.message).to.equal('socket hang up')
      expect(err.code).to.equal('ECONNRESET')
    })
    req.end()

    setTimeout(() => {
      const events = emitSpy.args.map(i => i[0])
      expect(events).to.deep.equal([
        'socket',
        'finish',
        'abort',
        'error',
        'close',
      ])
      expect(scope.isDone()).to.be.false()
      done()
    }, 10)
  })

  // The Interceptor is considered consumed just prior to the `response` event on the request,
  // all tests below assert the Scope is done.

  it('should not emit an error when called inside a `response` event listener', done => {
    const scope = nock('http://example.test').get('/').reply()

    const req = http.request('http://example.test')
    const emitSpy = sinon.spy(req, 'emit')

    req.on('response', () => {
      req.abort()
    })
    req.end()

    setTimeout(() => {
      const events = emitSpy.args.map(i => i[0])
      expect(events).to.deep.equal([
        'socket',
        'finish',
        'response',
        'abort',
        'close',
      ])
      scope.done()
      done()
    }, 10)
  })
})
