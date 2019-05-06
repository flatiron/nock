'use strict'

const { URL } = require('url')
const _ = require('lodash')
const debug = require('debug')('nock.common')

/**
 * Normalizes the request options so that it always has `host` property.
 *
 * @param  {Object} options - a parsed options object of the request
 */
const normalizeRequestOptions = function(options) {
  options.proto = options.proto || 'http'
  options.port = options.port || (options.proto === 'http' ? 80 : 443)
  if (options.host) {
    debug('options.host:', options.host)
    if (!options.hostname) {
      if (options.host.split(':').length == 2) {
        options.hostname = options.host.split(':')[0]
      } else {
        options.hostname = options.host
      }
    }
  }
  debug('options.hostname in the end: %j', options.hostname)
  options.host = `${options.hostname || 'localhost'}:${options.port}`
  debug('options.host in the end: %j', options.host)

  /// lowercase host names
  ;['hostname', 'host'].forEach(function(attr) {
    if (options[attr]) {
      options[attr] = options[attr].toLowerCase()
    }
  })

  return options
}

/**
 * Turns a URL into options. Taken directly from Node.js internals/url.js
 * - Utility function that converts a URL object into an ordinary
 *   options object as expected by the http.request and https.request
 *   APIs.
 * - https://github.com/nodejs/node/blob/7237eaa3353aacf284289c8b59b0a5e0fa5744bb/lib/internal/url.js#L1257
 * @param {URL} input
 */
const urlToOptions = function(input) {
  const options = {
    protocol: input.protocol,
    hostname: input.hostname.startsWith('[')
      ? input.hostname.slice(1, -1)
      : input.hostname,
    hash: input.hash,
    search: input.search,
    pathname: input.pathname,
    path: `${input.pathname}${input.search}`,
    href: input.href,
  }
  if (input.port !== '') {
    options.port = Number(input.port)
  }
  if (input.username || input.password) {
    options.auth = `${input.username}:${input.password}`
  }
  return options
}

/**
 * Takes input, output and callback - and returns a merged options and callback
 * Support for url in http.request/http.get was added in v10.9.0
 * - https://nodejs.org/en/blog/release/v10.9.0/
 *
 * @param {string|Object} input
 * @param {Object|function} options
 * @param {function|undefined} callback
 * @returns {Object}
 */
const requestParameters = function(input, options, callback) {
  if (typeof input === 'string') {
    input = urlToOptions(new URL(input))
  } else if (input && input instanceof URL) {
    input = urlToOptions(input)
  } else {
    callback = options
    options = input
    input = null
  }

  if (typeof options === 'function') {
    callback = options
    options = input || {}
  } else {
    options = Object.assign(input || {}, options)
    input = null
  }

  return { options, callback }
}

/**
 * Returns false if the data contained in buffer can be reconstructed
 * from its utf8 representation.
 *
 * TODO: Reverse the semantics of this method and refactor calling code
 * accordingly. We've inadvertantly gotten it flipped.
 *
 * @param  {Object} buffer - a Buffer object
 */
const isUtf8Representable = function(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return false
  }

  const utfEncodedBuffer = buffer.toString('utf8')
  const reconstructedBuffer = Buffer.from(utfEncodedBuffer, 'utf8')
  return !reconstructedBuffer.equals(buffer)
}

//  Array where all information about all the overridden requests are held.
let requestOverrides = {}

/**
 * Overrides the current `request` function of `http` and `https` modules with
 * our own version which intercepts issues HTTP/HTTPS requests and forwards them
 * to the given `newRequest` function.
 *
 * @param  {Function} newRequest - a function handling requests; it accepts four arguments:
 *   - proto - a string with the overridden module's protocol name (either `http` or `https`)
 *   - overriddenRequest - the overridden module's request function already bound to module's object
 *   - options - the options of the issued request
 *   - callback - the callback of the issued request
 * @param {boolean} legacy
 */
const overrideRequests = function(newRequest, legacy) {
  debug('overriding requests')
  ;['http', 'https'].forEach(function(proto) {
    debug('- overriding request for', proto)

    const moduleName = proto // 1 to 1 match of protocol and module is fortunate :)
    const module = {
      http: require('http'),
      https: require('https'),
    }[moduleName]
    const overriddenRequest = module.request
    const overriddenGet = module.get

    if (requestOverrides[moduleName]) {
      throw new Error(
        `Module's request already overridden for ${moduleName} protocol.`
      )
    }

    //  Store the properties of the overridden request so that it can be restored later on.
    requestOverrides[moduleName] = {
      module,
      request: overriddenRequest,
      get: overriddenGet,
    }

    if (legacy) {
      module.request = function(options, callback) {
        // debug('request options:', options);
        return newRequest(
          proto,
          overriddenRequest.bind(module),
          options,
          callback
        )
      }

      module.get = function(options, callback) {
        const req = newRequest(
          proto,
          overriddenRequest.bind(module),
          options,
          callback
        )
        req.end()
        return req
      }
    } else {
      module.request = function(input, options, callback) {
        const params = requestParameters(input, options, callback)
        options = params.options
        callback = params.callback

        // debug('request options:', options);
        return newRequest(
          proto,
          overriddenRequest.bind(module),
          options,
          callback
        )
      }

      module.get = function(input, options, callback) {
        const params = requestParameters(input, options, callback)
        options = params.options
        callback = params.callback

        const req = newRequest(
          proto,
          overriddenRequest.bind(module),
          options,
          callback
        )
        req.end()
        return req
      }
    }

    debug('- overridden request for', proto)
  })
}

/**
 * Restores `request` function of `http` and `https` modules to values they
 * held before they were overridden by us.
 */
const restoreOverriddenRequests = function() {
  debug('restoring requests')
  Object.entries(requestOverrides).forEach(
    ([proto, { module, request, get }]) => {
      debug('- restoring request for', proto)
      module.request = request
      module.get = get
      debug('- restored request for', proto)
    }
  )
  requestOverrides = {}
}

/**
 * Get high level information about request as string
 * @param  {Object} options
 * @param  {string} options.method
 * @param  {string} options.port
 * @param  {string} options.proto
 * @param  {string} options.hostname
 * @param  {string} options.path
 * @param  {Object} options.headers
 * @param  {string|object} body
 * @return {string}
 */
function stringifyRequest(options, body) {
  const method = options.method || 'GET'

  let { port } = options
  // TODO-coverage: Add a test to cover the missing condition, or remove if
  // not reachable.
  if (!port) port = options.proto == 'https' ? '443' : '80'

  if (
    (options.proto == 'https' && port == '443') ||
    (options.proto == 'http' && port == '80')
  ) {
    port = ''
  }

  if (port) port = `:${port}`

  // TODO-coverage: Add a test to cover the missing condition, or remove if
  // not reachable.
  const path = options.path ? options.path : ''

  const log = {
    method,
    url: `${options.proto}://${options.hostname}${port}${path}`,
    headers: options.headers,
  }

  if (body) {
    log.body = body
  }

  return JSON.stringify(log, null, 2)
}

function isContentEncoded(headers) {
  const contentEncoding = _.get(headers, 'content-encoding')
  return _.isString(contentEncoding) && contentEncoding !== ''
}

function contentEncoding(headers, encoder) {
  const contentEncoding = _.get(headers, 'content-encoding')
  return contentEncoding === encoder
}

function isJSONContent(headers) {
  let contentType = _.get(headers, 'content-type')
  if (Array.isArray(contentType)) {
    contentType = contentType[0]
  }
  contentType = (contentType || '').toLocaleLowerCase()

  return contentType === 'application/json'
}

const headersFieldNamesToLowerCase = function(headers) {
  if (!_.isObject(headers)) {
    // TODO-coverage: Add a test to cover the missing condition, or remove if
    // not reachable.
    return headers
  }

  //  For each key in the headers, delete its value and reinsert it with lower-case key.
  //  Keys represent headers field names.
  const lowerCaseHeaders = {}
  _.forOwn(headers, function(fieldVal, fieldName) {
    const lowerCaseFieldName = fieldName.toLowerCase()
    if (!_.isUndefined(lowerCaseHeaders[lowerCaseFieldName])) {
      throw new Error(
        `Failed to convert header keys to lower case due to field name conflict: ${lowerCaseFieldName}`
      )
    }
    lowerCaseHeaders[lowerCaseFieldName] = fieldVal
  })

  return lowerCaseHeaders
}

const headersFieldsArrayToLowerCase = function(headers) {
  return _.uniq(
    _.map(headers, function(fieldName) {
      return fieldName.toLowerCase()
    })
  )
}

const headersArrayToObject = function(rawHeaders) {
  if (!Array.isArray(rawHeaders)) {
    throw Error('Expected a header array')
  }

  const headers = {}

  for (let i = 0, len = rawHeaders.length; i < len; i = i + 2) {
    const key = rawHeaders[i].toLowerCase()
    const value = rawHeaders[i + 1]

    if (headers[key]) {
      headers[key] = _.isArray(headers[key]) ? headers[key] : [headers[key]]
      headers[key].push(value)
    } else {
      headers[key] = value
    }
  }

  return headers
}

/**
 * Deletes the given `fieldName` property from `headers` object by performing
 * case-insensitive search through keys.
 *
 * @headers   {Object} headers - object of header field names and values
 * @fieldName {String} field name - string with the case-insensitive field name
 */
const deleteHeadersField = function(headers, fieldNameToDelete) {
  if (!_.isObject(headers) || !_.isString(fieldNameToDelete)) {
    // TODO-coverage: For `_.isObject(headers)`, add a test to cover the
    // missing condition, or remove if not reachable. For
    // `_.isString(fieldNameToDelete)`, throw an error and add a test covering
    // this case.
    return
  }

  const lowerCaseFieldNameToDelete = fieldNameToDelete.toLowerCase()

  //  Search through the headers and delete all values whose field name matches the given field name.
  _(headers)
    .keys()
    .each(function(fieldName) {
      const lowerCaseFieldName = fieldName.toLowerCase()
      if (lowerCaseFieldName === lowerCaseFieldNameToDelete) {
        delete headers[fieldName]
        //  We don't stop here but continue in order to remove *all* matching field names
        //  (even though if seen regorously there shouldn't be any)
      }
    })
}

function percentDecode(str) {
  try {
    return decodeURIComponent(str.replace(/\+/g, ' '))
  } catch (e) {
    return str
  }
}

function percentEncode(str) {
  // TODO-coverage: either replace this with a library function or add a
  // function test which checks that this is correct.
  // This looks like:
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
  return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
    return `%${c
      .charCodeAt(0)
      .toString(16)
      .toUpperCase()}`
  })
}

function matchStringOrRegexp(target, pattern) {
  const str =
    (!_.isUndefined(target) && target.toString && target.toString()) || ''

  return pattern instanceof RegExp
    ? str.match(pattern)
    : str === String(pattern)
}

/**
 * Formats a query parameter.
 *
 * @param key                The key of the query parameter to format.
 * @param value              The value of the query parameter to format.
 * @param stringFormattingFn The function used to format string values. Can
 *                           be used to encode or decode the query value.
 *
 * @returns the formatted [key, value] pair.
 */
function formatQueryValue(key, value, stringFormattingFn) {
  // TODO-coverage: Find out what's not covered. Probably refactor code to
  // replace `switch(true)` with `if`/`else`.
  switch (true) {
    case _.isNumber(value): // fall-through
    case _.isBoolean(value):
      value = value.toString()
      break
    case _.isUndefined(value): // fall-through
    case _.isNull(value):
      value = ''
      break
    case _.isString(value):
      if (stringFormattingFn) {
        value = stringFormattingFn(value)
      }
      break
    case value instanceof RegExp:
      break
    case _.isArray(value): {
      const tmpArray = new Array(value.length)
      for (let i = 0; i < value.length; ++i) {
        tmpArray[i] = formatQueryValue(i, value[i], stringFormattingFn)[1]
      }
      value = tmpArray
      break
    }
    case _.isObject(value): {
      const tmpObj = {}
      _.forOwn(value, function(subVal, subKey) {
        const subPair = formatQueryValue(subKey, subVal, stringFormattingFn)
        tmpObj[subPair[0]] = subPair[1]
      })
      value = tmpObj
      break
    }
  }

  if (stringFormattingFn) key = stringFormattingFn(key)
  return [key, value]
}

function isStream(obj) {
  return (
    obj &&
    typeof a !== 'string' &&
    !Buffer.isBuffer(obj) &&
    _.isFunction(obj.setEncoding)
  )
}

exports.normalizeRequestOptions = normalizeRequestOptions
exports.urlToOptions = urlToOptions
exports.requestParameters = requestParameters
exports.isUtf8Representable = isUtf8Representable
exports.overrideRequests = overrideRequests
exports.restoreOverriddenRequests = restoreOverriddenRequests
exports.stringifyRequest = stringifyRequest
exports.isContentEncoded = isContentEncoded
exports.contentEncoding = contentEncoding
exports.isJSONContent = isJSONContent
exports.headersFieldNamesToLowerCase = headersFieldNamesToLowerCase
exports.headersFieldsArrayToLowerCase = headersFieldsArrayToLowerCase
exports.headersArrayToObject = headersArrayToObject
exports.deleteHeadersField = deleteHeadersField
exports.percentEncode = percentEncode
exports.percentDecode = percentDecode
exports.matchStringOrRegexp = matchStringOrRegexp
exports.formatQueryValue = formatQueryValue
exports.isStream = isStream
