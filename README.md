# Publication archives record harvester for the Melinda record batch import system  [![Build Status](https://travis-ci.org/NatLibFi/melinda-record-import-harvester-publication-archives.svg)](https://travis-ci.org/NatLibFi/melinda-record-import-harvester-publication-archives) [![Test Coverage](https://codeclimate.com/github/NatLibFi/melinda-record-import-harvester-publication-archives/badges/coverage.svg)](https://codeclimate.com/github/NatLibFi/melinda-record-import-harvester-publication-archives/coverage)

Publication archives record harvester for the Melinda record batch import system. Harvests Dublic Core records from [publication archives](https://www.kansalliskirjasto.fi/en/services/system-platform-services/publication-archive-service).
## License and copyright

Copyright (c) 2018 **University Of Helsinki (The National Library Of Finland)**

This project's source code is licensed under the terms of **GNU Affero General Public License Version 3** or any later version.

## Environment variables
* HARVESTING_API_URL URL of harvesting endpoint (http://tampub.uta.fi/oai/request)
* HARVESTING_API_METADATA Filtering of correct datatype (kk)
* HARVESTING_API_FILTER Logic rule to filter harvested XML ('@qualifier="available"' or '@qualifier="issued" and @value>"2016"') 
* HARVESTING_API_FILTER_NAMESPACE What namespace is filtered (http://kk/1.0) 
* RECORD_IMPORT_API_URL=ToDo
* RECORD_IMPORT_API_USERNAME=ToDo 
* RECORD_IMPORT_API_PASSWORD=ToDo 
* RECORD_IMPORT_API_PROFILE=ToDo

### XML filtering
XML filtering is used to:
* Remove deleted records, these have status=deleted
* Filter only records matching filtering rule provided with **HARVESTING_API_FILTER** and from namespace **HARVESTING_API_FILTER_NAMESPACE**

Filtering deleted records is static functionality but filtering rule can be configurated. This functionality is implemented with [filterxml](https://www.npmjs.com/package/filterxml) Filterxml filters XML using xpath syntax, but **HARVESTING_API_FILTER** is combined to existing logic:
```
'x:metadata[not(x:field[' + process.env.HARVESTING_API_FILTER + '])]/../..'
```
More about [xpath](https://www.w3schools.com/xml/xpath_syntax.asp).
