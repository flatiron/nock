'use strict'

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
      if (options.host.split(':').length === 2) {
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
 * Returns false if the data contained in buffer can be reconstructed
 * from its utf8 representation.
 *
 * TODO: Reverse the semantics of this method and refactor calling code
 * accordingly. We've inadvertently gotten it flipped.
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
 */
const overrideRequests = function(newRequest) {
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
 * @param  {number|string} options.port
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
  // The step seems useless considering we don't show the port for standard 80/443 anyway.
  // It's not clear whether the port could be set to something other than http or https. If
  // it is, this would make an unspecified port default to 80, which is probably incorrect.
  if (!port) port = options.proto === 'https' ? '443' : '80'

  if (
    (options.proto === 'https' && (port === 443 || port === '443')) ||
    (options.proto === 'http' && (port === 80 || port === '80'))
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
  const contentEncoding = headers['content-encoding']
  return _.isString(contentEncoding) && contentEncoding !== ''
}

function contentEncoding(headers, encoder) {
  const contentEncoding = headers['content-encoding']
  return contentEncoding === encoder
}

function isJSONContent(headers) {
  // https://tools.ietf.org/html/rfc8259
  const contentType = (headers['content-type'] || '').toLowerCase()
  return contentType.startsWith('application/json')
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

/**
 * Converts the various accepted formats of headers into a flat array representing "raw headers".
 *
 * Nock allows headers to be provided as a raw array, a plain object, or a Map.
 *
 * While all the header names are expected to be strings, the values are left intact as they can
 * be functions, strings, or arrays of strings.
 *
 *  https://nodejs.org/api/http.html#http_message_rawheaders
 */
const headersInputToRawArray = function(headers) {
  if (headers === undefined) {
    return []
  }

  if (Array.isArray(headers)) {
    // If the input is an array, assume it's already in the raw format and simply return a copy
    // but throw an error if there aren't an even number of items in the array
    if (headers.length % 2) {
      throw new Error(
        `Raw headers must be provided as an array with an even number of items. [fieldName, value, ...]`
      )
    }
    return [...headers]
  }

  // [].concat(...) is used instead of Array.flat until v11 is the minimum Node version
  if (_.isMap(headers)) {
    return [].concat(...Array.from(headers, ([k, v]) => [k.toString(), v]))
  }

  if (_.isPlainObject(headers)) {
    return [].concat(...Object.entries(headers))
  }

  throw new Error(
    `Headers must be provided as an array of raw values, a Map, or a plain Object. ${headers}`
  )
}

/**
 * Converts an array of raw headers to an object, using the same rules as Nodes `http.IncomingMessage.headers`.
 *
 * Header names/keys are lower-cased.
 */
const headersArrayToObject = function(rawHeaders) {
  if (!Array.isArray(rawHeaders)) {
    throw Error('Expected a header array')
  }

  const accumulator = {}

  forEachHeader(rawHeaders, (value, fieldName) => {
    addHeaderLine(accumulator, fieldName, value)
  })

  return accumulator
}

const noDuplicatesHeaders = new Set([
  'age',
  'authorization',
  'content-length',
  'content-type',
  'etag',
  'expires',
  'from',
  'host',
  'if-modified-since',
  'if-unmodified-since',
  'last-modified',
  'location',
  'max-forwards',
  'proxy-authorization',
  'referer',
  'retry-after',
  'user-agent',
])

/**
 * Set key/value data in accordance with Node's logic for folding duplicate headers.
 *
 * The `value` param should be a function, string, or array of strings.
 *
 * Node's docs and source:
 * https://nodejs.org/api/http.html#http_message_headers
 * https://github.com/nodejs/node/blob/908292cf1f551c614a733d858528ffb13fb3a524/lib/_http_incoming.js#L245
 *
 * Header names are lower-cased.
 * Duplicates in raw headers are handled in the following ways, depending on the header name:
 * - Duplicates of field names listed in `noDuplicatesHeaders` (above) are discarded.
 * - `set-cookie` is always an array. Duplicates are added to the array.
 * - For duplicate `cookie` headers, the values are joined together with '; '.
 * - For all other headers, the values are joined together with ', '.
 *
 * Node's implementation is larger because it highly optimizes for not having to call `toLowerCase()`.
 * We've opted to always call `toLowerCase` in exchange for a more concise function.
 *
 * While Node has the luxury of knowing `value` is always a string, we do an extra step of coercion at the top.
 */
const addHeaderLine = function(headers, name, value) {
  let values // code below expects `values` to be an array of strings
  if (typeof value === 'function') {
    // Function values are evaluated towards the end of the response, before that we use a placeholder
    // string just to designate that the header exists. Useful when `Content-Type` is set with a function.
    values = [value.name]
  } else if (Array.isArray(value)) {
    values = value.map(String)
  } else {
    values = [String(value)]
  }

  const key = name.toLowerCase()
  if (key === 'set-cookie') {
    // Array header -- only Set-Cookie at the moment
    if (headers['set-cookie'] === undefined) {
      headers['set-cookie'] = values
    } else {
      headers['set-cookie'].push(...values)
    }
  } else if (noDuplicatesHeaders.has(key)) {
    if (headers[key] === undefined) {
      // Drop duplicates
      headers[key] = values[0]
    }
  } else {
    if (headers[key] !== undefined) {
      values = [headers[key], ...values]
    }

    const separator = key === 'cookie' ? '; ' : ', '
    headers[key] = values.join(separator)
  }
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
        //  (even though if seen rigorously there shouldn't be any)
      }
    })
}

/**
 * Utility for iterating over a raw headers array.
 *
 * The callback is called with:
 *  - The header value. string, array of strings, or a function
 *  - The header field name. string
 *  - Index of the header field in the raw header array.
 */
const forEachHeader = function(rawHeaders, callback) {
  for (let i = 0; i < rawHeaders.length; i += 2) {
    callback(rawHeaders[i + 1], rawHeaders[i], i)
  }
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
 * @returns *[] the formatted [key, value] pair.
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
    typeof obj !== 'string' &&
    !Buffer.isBuffer(obj) &&
    _.isFunction(obj.setEncoding)
  )
}

exports.normalizeRequestOptions = normalizeRequestOptions
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
exports.headersInputToRawArray = headersInputToRawArray
exports.deleteHeadersField = deleteHeadersField
exports.forEachHeader = forEachHeader
exports.percentEncode = percentEncode
exports.percentDecode = percentDecode
exports.matchStringOrRegexp = matchStringOrRegexp
exports.formatQueryValue = formatQueryValue
exports.isStream = isStream
