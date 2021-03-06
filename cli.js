#! /usr/bin/env node
'use strict'

const minimist = require('minimist')
const pump = require('pump')
const fs = require('fs')
const path = require('path')
const pinoOpenSearch = require('./lib')

function start (opts) {
  if (opts.help) {
    console.log(fs.readFileSync(path.join(__dirname, './usage.txt'), 'utf8'))
    return
  }

  if (opts.version) {
    console.log('pino-opensearch', require('./package.json').version)
    return
  }

  if (opts.username && opts.password) {
    opts.auth = {
      username: opts.username,
      password: opts.password
    }
  }

  if (opts['api-key']) {
    opts.auth = { apiKey: opts['api-key'] }
  }

  if (opts.cloud) {
    opts.cloud = { id: opts.cloud }
  }

  const stream = pinoOpenSearch(opts)

  stream.on('unknown', (line, error) => {
    console.error('OpenSearch client json error in line:\n' + line + '\nError:', error)
  })
  stream.on('error', (error) => {
    console.error('OpenSearch client error:', error)
  })
  stream.on('insertError', (error) => {
    console.error('OpenSearch server error:', error)
  })

  if (opts.rejectUnauthorized) {
    opts.rejectUnauthorized = opts.rejectUnauthorized !== 'false'
  }
  pump(process.stdin, stream)
}

const flags = minimist(process.argv.slice(2), {
  alias: {
    version: 'v',
    help: 'h',
    node: 'n',
    index: 'i',
    'bulk-size': 'b',
    'flush-bytes': 'f',
    'flush-interval': 't',
    'trace-level': 'l',
    username: 'u',
    password: 'p',
    'api-key': 'k',
    cloud: 'c',
    'read-config': 'r'
  },
  default: {
    node: 'http://localhost:9200'
  }
})

const allowedProps = ['node', 'index', 'bulk-size', 'flush-btyes', 'flush-interval', 'trace-level', 'username', 'password', 'api-key', 'cloud', 'es-version', 'rejectUnauthorized']

if (flags['read-config']) {
  if (flags['read-config'].match(/.*\.json$/) !== null) {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), flags['read-config']), 'utf-8'))
    allowedProps.forEach(key => {
      if (config[key]) { flags[key] = config[key] }
    })
  }

  if (flags['read-config'].match(/.*\.js$/) !== null) {
    const config = require(path.join(process.cwd(), flags['read-config']))
    allowedProps.forEach(key => {
      if (config[key]) { flags[key] = config[key] }
    })
  }
}
start(flags)
