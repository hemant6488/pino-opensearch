# pino-opensearch&nbsp;&nbsp;[![Build Status](https://github.com/pinojs/pino-elasticsearch/workflows/CI/badge.svg)](https://github.com/pinojs/pino-elasticsearch/actions)&nbsp;[![Coverage Status](https://coveralls.io/repos/github/pinojs/pino-elasticsearch/badge.svg?branch=master)](https://coveralls.io/github/pinojs/pino-elasticsearch?branch=master)

Stream [pino](https://github.com/pinojs/pino) logs into [OpenSearch](https://opensearch.org/docs/latest/opensearch/index/).

## Install

```
npm install -g pino-opensearch
```

## Usage

```
  pino-opensearch

  To send pino logs to AWS OpenSearch:

     cat log | pino-opensearch --node http://localhost:9200

  Flags
  -h  | --help              Display Help
  -v  | --version           display Version
  -n  | --node              the URL where OpenSearch is running
  -i  | --index             the name of the index to use; default: pino
                            will replace %{DATE} with the YYYY-MM-DD date
  -t  | --type              the name of the type to use; default: log
  -f  | --flush-bytes       the number of bytes for each bulk insert; default: 1000
  -t  | --flush-interval    time that the helper will wait before flushing; default: 30000
  -b  | --bulk-size         the number of documents for each bulk insert [DEPRECATED]
  -l  | --trace-level       trace level for the OpenSearch client, default 'error' (info, debug, trace).
      | --es-version        specify the major version number of OpenSearch (eg: 5, 6, 7)
                            (this is needed only if you are using OpenSearch <= 7)
  -u  | --username          Username to specify with authentication method
                            (can only be used in tandem with the 'password' flag)
  -p  | --password          Password to specify with authentication method
                            (can only be used in tandem with the 'username' flag)
  -k  | --api-key           Api key for authentication instead of username/password combination
  -c  | --cloud             Id of the elastic cloud node to connect to
  -r  | --read-config       the name of config file
  --rejectUnauthorized      Reject any connection which is not authorized with the list of supplied CAs; default: true

```

### Usage as module

```js
const pino = require('pino')
const pinoOpenSearch = require('pino-opensearch')

const streamToOpenSearch = pinoOpenSearch({
  index: 'an-index',
  consistency: 'one',
  node: 'http://localhost:9200',
  'es-version': 7,
  'flush-bytes': 1000
})

const logger = pino({ level: 'info' }, streamToOpenSearch)

logger.info('hello world')
// ...
```

### Using multiple streams (output to Console and OpenSearch)

If you want to output to multiple streams (transports and console)), the simplest way is to use the `pino-multi-stream` library and register a stream per output.

```js
const pinoOpenSearch = require('pino-opensearch');
const pinoMultiStream = require('pino-multi-stream').multistream;

const streamToOpenSearch = pinoOpenSearch({
  index: 'an-index',
  consistency: 'one',
  node: 'http://localhost:9200',
  'es-version': 7,
  'flush-bytes': 1000
});

const pinoOptions = {};

return pino(pinoOptions, pinoMultiStream([
  { stream: process.stdout },
  { stream: streamToOpenSearch },
]));
```

Checkout [pino-multi-stream](https://github.com/pinojs/pino-multi-stream)

### Custom Connection

If you want to use a custom Connection class for the OpenSearch client, you can pass it as an option when using as a module. See the OpenSearch client docs for [Connection](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/master/advanced-config.html#_connection).

```js
const pino = require('pino')
const pinoOpenSearch = require('pino-opensearch')

const Connection = <custom Connection>

const streamToOpenSearch = pinoOpenSearch({
  index: 'an-index',
  consistency: 'one',
  node: 'http://localhost:9200',
  'es-version': 7,
  'flush-bytes': 1000,
  Connection
})

const logger = pino({ level: 'info' }, streamToOpenSearch)

logger.info('hello world')
// ...
```

### Troubleshooting

Assuming your OpenSearch instance is running and accessible, there are a couple of common problems that will cause indices or events (log entries) to not be created in OpenSearch when using this library.  Developers can get feedback on these problems by listening for events returned by the stream handler.

The stream handler returned from the default factory function is an [`EventEmitter`](https://nodejs.org/api/events.html#events_class_eventemitter).  Developers can use this interface to debug issues encountered by the `pino-opensearch` library.

```js
const pinoOpenSearch = require('pino-opensearch');

const streamToOpenSearch = pinoOpenSearch({
  index: 'an-index',
  consistency: 'one',
  node: 'http://localhost:9200',
  'es-version': 7,
  'flush-bytes': 1000
})

streamToOpenSearch.on('<event>', (error) => console.log(event));
```

The following table lists the events emitted by the stream handler:

| Event | Callback Signature | Description |
| ----- | ------------------ | ----------- |
| `unknown` | `(line: string, error: string) => void` | Event received by `pino-opensearch` is unparseable (via `JSON.parse`) |
| `insertError` | `(error: Error & { document: Record<string, any> }) => void` | The bulk insert request to OpenSearch failed (records dropped). |
| `insert` | `(stats: Record<string, any>) => void` | Called when an insert was successfully performed |
| `error` | `(error: Error) => void` | Called when the OpenSearch client fails for some other reason |

There are a few common problems developers will encounter when initially using this library.  The next section discusses these issues.

**Pino output is not JSON**

Any transform of the stream (like `pino-pretty`) that results in an non-JSON stream output will be ignored (the `unknown` event will be emitted).

```js
const pino = require('pino');
const pinoOpenSearch = require('pino-opensearch');

const streamToOpenSearch = pinoOpenSearch({
  index: 'an-index',
  consistency: 'one',
  node: 'http://localhost:9200',
  'es-version': 7,
  'flush-bytes': 1000
})

streamToOpenSearch.on(
  'unknown',
  (line, error) =>
    console.log('Expect to see a lot of these with Pino Pretty turned on.')
);

const logger = pino({
  prettyPrint: true,
}, streamToOpenSearch)
```

**Events do not match index schema/mappings**

Elasticsearch schema mappings are strict and if events do not match their format, the events will be dropped.  A typical example is if you use the default `pino` format with the `logs-` index in OpenSearch.  The default installation of OpenSearch includes a data pipeline mapped to the `logs-` index prefix.  This is intended to be used by the Beats and Logstash aggregators and requires `@timestamp` and `@message` fields.  The default `pino` setup uses `time` and `msg`.  Attempting to write events to the `logs-` index without mapping/transforming the `pino` schema will result in events being dropped.

Developers can troubleshoot insert errors by watching for the `insertError` event.

```js
streamToOpenSearch.on(
  'insertError',
  (error) => {
    const documentThatFailed = error.document;
    console.log(`An error occurred insert document:`, documentThatFailed);
  }
);
```

### ECS support

If you want to use [Elastic Common Schema](https://www.elastic.co/guide/en/ecs/current/index.html), you should install [`@elastic/ecs-pino-format`](https://github.com/elastic/ecs-logging-js/tree/master/loggers/pino), as the `ecs` option of this module has been removed.

```js
const pino = require('pino')
const ecsFormat = require('@elastic/ecs-pino-format')()
const pinoOpenSearch = require('pino-opensearch')

const streamToOpenSearch = pinoOpenSearch({
  index: 'an-index',
  consistency: 'one',
  node: 'http://localhost:9200',
  'es-version': 7,
  'flush-bytes': 1000
})

const logger = pino({ level: 'info',  ...ecsFormat  }, streamToOpenSearch)

logger.info('hello world')
// ...
```

You can then use [Kibana](https://www.elastic.co/products/kibana) to
browse and visualize your logs.  
**Note:** This transport works only with OpenSearch version ≥ 5.

#### Dynamic index

It is possible to customize the index name for every log line just providing a function to the `index` option:

```js
const pino = require('pino')
const pinoOpenSearch = require('pino-opensearch')

const streamToOpenSearch = pinoOpenSearch({
  index: function (logTime) {
    // the logTime is a ISO 8601 formatted string of the log line
    return `awesome-app-${logTime.substring(5, 10)}`
  },
  consistency: 'one',
  node: 'http://localhost:9200'
})
// ...
```

The function **must** be sync, doesn't throw and return a string.

#### Datastreams

Indexing to datastreams requires the `op_type` to be set to `create`:
```js
const pino = require('pino')
const pinoOpenSearch = require('pino-opensearch')

const streamToOpenSearch = pinoOpenSearch({
  index: "type-dataset-namespace",
  consistency: 'one',
  node: 'http://localhost:9200',
  op_type: 'create'
})
// ...
```

#### Error handling
```js
const pino = require('pino')
const ecsFormat = require('@elastic/ecs-pino-format')()
const pinoOpenSearch = require('pino-opensearch')

const streamToOpenSearch = pinoOpenSearch({
  index: 'an-index',
  consistency: 'one',
  node: 'http://localhost:9200',
  'es-version': 7,
  'flush-bytes': 1000
})

// Capture errors like unable to connect OpenSearch instance.
steamToElastic.on('error', (error) => {
  console.error('Elasticsearch client error:', error);
})
// Capture errors returned from OpenSearch, "it will be called for everytime a document can't be indexed".
streamToOpenSearch.on('insertError', (error) => {
  console.error('Elasticsearch server error:', error);
})

const logger = pino({ level: 'info',  ...ecsFormat  }, streamToOpenSearch)

logger.info('hello world')
```

### Authentication
If you need to use basic authentication to connect with the OpenSearch cluster, pass the credentials in the URL:
```
cat log | pino-opensearch --node https://user:pwd@localhost:9200
```

Alternatively you can supply a combination of `username` and `password` OR `api-key`:
```
cat log | pino-opensearch --node https://localhost:9200 -u user -p pwd
```
```
cat log | pino-opensearch --node https://localhost:9200 --api-key=base64EncodedKey
```

Elastic cloud option `cloud` is also supported:
```sh
cat log | pino-opensearch --cloud=name:bG9jYWxob3N0JGFiY2QkZWZnaA== --api-key=base64EncodedKey
```

Note: When using the cli, if you pass username/password AND an apiKey the apiKey will take precedence over the username/password combination.

You can also include the `auth` field in your configuration like so:
```js
const pinoOpenSearch = require('pino-opensearch')

const streamToOpenSearch = pinoOpenSearch({
  index: 'an-index',
  consistency: 'one',
  node: 'http://localhost:9200',
  auth: {
    username: 'user',
    password: 'pwd'
  },
  'es-version': 7,
  'flush-bytes': 1000
})
```

Alternatively you can pass an `apiKey` instead:
```js
const pinoOpenSearch = require('pino-opensearch')

const streamToOpenSearch = pinoOpenSearch({
  index: 'an-index',
  consistency: 'one',
  node: 'http://localhost:9200',
  cloud: {
    id: 'name:bG9jYWxob3N0JGFiY2QkZWZnaA=='
  },
  auth: {
    apiKey: 'apikey123'
  },
  'es-version': 7,
  'flush-bytes': 1000
})
```

For a full list of authentication options when using elastic, check out the [authentication configuration docs](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/auth-reference.html)

## Use as a module

use pino-opensearch as a module is simple, use [pino-multi-stream](https://www.npmjs.com/package/pino-multi-stream) to send log to multi transport, for example:

```js
const pinoms = require('pino-multi-stream')
const pinoEs = require('pino-opensearch')({
    host: '192.168.1.220',
    index: 'zb',
    port: '9200'
})

const logger = pinoms({
    streams: [
      {level: 'error', stream: process.stderr}, // an "error" level destination stream
      {level: 'info', stream: process.stdout}, // an "info" level destination stream
      {stream: pinoEs}
    ]
  })


logger.info({'msg': {'info': 'info'}})
logger.debug('debug')
logger.warn('warn')
logger.error('error')

```

*** Notice, the `host` and `port` parameters of `pino-opensearch` are required ***

## Setup and Testing

Setting up pino-opensearch is easy, and you can use the bundled
`docker-compose.yml` file to bring up both
[Elasticsearch](https://www.elastic.co/products/elasticsearch) and
[Kibana](https://www.elastic.co/products/kibana).

You will need [docker](https://www.docker.com/) and
[docker-compose](https://docs.docker.com/compose/), then in this project
folder, launch `docker-compose -f docker-compose-v7.yml up`.

You can test it by launching `node example | pino-opensearch`, in
this project folder. You will need to have `pino-opensearch`
installed globally.

## Acknowledgements

This project if forked from [pino-elasticsearch](https://github.com/pinojs/pino-elasticsearch).

## License

Licensed under [MIT](./LICENSE).
