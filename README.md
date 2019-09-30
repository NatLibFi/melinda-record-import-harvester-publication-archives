# Publication archives record harvester for the Melinda record batch import system  [![Build Status](https://travis-ci.org/NatLibFi/melinda-record-import-harvester-publication-archives.svg)](https://travis-ci.org/NatLibFi/melinda-record-import-harvester-publication-archives) [![Test Coverage](https://codeclimate.com/github/NatLibFi/melinda-record-import-harvester-publication-archives/badges/coverage.svg)](https://codeclimate.com/github/NatLibFi/melinda-record-import-harvester-publication-archives/coverage)

Publication archives record harvester for the Melinda record batch import system. Harvests Dublic Core records from [publication archives](https://www.kansalliskirjasto.fi/en/services/system-platform-services/publication-archive-service).
## License and copyright

Copyright (c) 2019 **University Of Helsinki (The National Library Of Finland)**

This project's source code is licensed under the terms of **GNU Affero General Public License Version 3** or any later version.

## Environment variables
### Mandatory environment values
Following variables are required for passing harvested records to import system. (API) This behaviour is inherited from [melinda-record-import-commons](https://github.com/NatLibFi/melinda-record-import-commons). 
* API_URL
* API_USERNAME
* API_PASSWORD
* API_PROFILE

### Optional environmental values
These values have default values in projects configuration file src/config.js, and at least URL should be set for each instance. Default values may change.
* POLL_INTERVAL
  - Polling interval of configurated endpoint in milliseconds
  - default: '10000'
---
* POLL_CHANGE_TIMESTAMP
  - Timestamp of last polling time on startup in ISO 8601, overwriten by file set by CHANGE_TIMESTAMP_FILE 
  - default: '2019-01-01T10:00:00+02:00'
* CHANGE_TIMESTAMP_FILE
  - File for saving timestamps after harvest cycle, overwrites POLL_CHANGE_TIMESTAMP on startup
  - default: '.poll-change-timestamp.json'
* FAILED_HARVEST_FILE
  - default: '.failed-harvest-log.json'
---
* HARVESTING_API_URL 
  - URL of harvesting endpoint
  - default: 'http://tampub.uta.fi/oai/request'
* HARVESTING_API_METADATA
  - Filtering of correct datatype
  - default: 'kk'
* HARVESTING_API_FILTER 
  - Logic rule to filter harvested XML as XPath
  - default: '@qualifier="issued" and @value>"2016"'
  - example: '@qualifier="available"'
* HARVESTING_API_FILTER_ISBN
  - Are records without ISBN filtered out 
  - default: true
* HARVESTING_API_FILTER_NAMESPACE
  - What namespace in XML-DC is used 
  - default: 'http://kk/1.0'

### XML filtering
XML filtering is used to:
* Remove deleted records, these have status=deleted
* Filter only records matching filtering rule provided with **HARVESTING_API_FILTER** and from namespace **HARVESTING_API_FILTER_NAMESPACE**
* Setting **HARVESTING_API_FILTER_ISBN** to true will also filter out records without ISBN value set in one of qualifier fields.

Filtering deleted records is static functionality but filtering rule can be configurated. This functionality is implemented with [filterxml](https://www.npmjs.com/package/filterxml) Filterxml filters XML using xpath syntax, but **HARVESTING_API_FILTER** is combined to existing logic:
**HARVESTING_API_FILTER_ISBN false**
```
'x:metadata[not(x:field[' + process.env.HARVESTING_API_FILTER + '])]/../..'
```
**HARVESTING_API_FILTER_ISBN true**
```
'x:metadata[not(x:field[' + harvestFilter + ']) or not(x:field[@qualifier="isbn"])]/../..'
```
More about [xpath](https://www.w3schools.com/xml/xpath_syntax.asp).
