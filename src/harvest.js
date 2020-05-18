/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Helmet record harvester for the Melinda record batch import system
*
* Copyright (C) 2018 University Of Helsinki (The National Library Of Finland)
*
* This file is part of melinda-record-import-harvester-publication-archives
*
* melinda-record-import-harvester-publication-archives program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* melinda-record-import-harvester-publication-archives is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

/* eslint-disable no-unused-vars, no-console */

import fs from 'fs';
import {URL} from 'url';
import moment from 'moment';
import fetch from 'node-fetch';
import {promisify} from 'util';
import HttpStatusCodes from 'http-status-codes';
import {Utils} from '@natlibfi/melinda-commons';
import {Parser, Builder} from 'xml2js';

const {createLogger} = Utils;

export default function ({recordsCallback, harvestingApiUrl, metadataPrefix,
  pollInterval, pollChangeTimestamp,
  filterIsbnOnly, filterIssuedYear,
  changeTimestampFile, onlyOnce = false}) {
  const logger = createLogger();
  const setTimeoutPromise = promisify(setTimeout);

  return process();

  async function process({pollChangeTime = getPollChangeTime()} = {}) {
    const timeBeforeFetching = moment();

    logger.log('info', `Fetching records updated between ${pollChangeTime.format()} - ${timeBeforeFetching.format()}`);

    await harvest();

    if (onlyOnce) {
      return;
    }

    logger.log('info', `Waiting ${pollInterval / 1000} seconds before polling again`);

    await setTimeoutPromise(pollInterval);
    writePollChangeTimestamp(timeBeforeFetching);
    return process({pollChangeTime: timeBeforeFetching.add(1, 'seconds')});

    function writePollChangeTimestamp(time) {
      fs.writeFileSync(changeTimestampFile, JSON.stringify({
        timestamp: time.format()
      }));
    }

    async function harvest(token) {
      const url = generateUrl();
      const response = await fetch(url);

      if (response.status === HttpStatusCodes.OK) {
        logger.log('debug', 'Got response');
        return processResponse(await response.text());
      }

      throw new Error(`HTTP error. URL: ${url}, payload: ${await response.text()}`);

      function generateUrl() {
        const params = new URLSearchParams(token ? {
          verb: 'ListRecords',
          resumptionToken: token
        } : {
          verb: 'ListRecords',
          from: getPollChangeTime().toISOString(),
          metadataPrefix
        });

        return new URL(`${harvestingApiUrl}?${params.toString()}`);
      }

      async function processResponse(data) {
        const obj = await parse();
        const resumptionToken = getResumptionToken();

        if (obj['OAI-PMH'].error) { // eslint-disable-line functional/no-conditional-statement
          throw new Error(`URL: ${url}: ${JSON.stringify(obj, undefined, 2)}`);
        }

        const filtered = filter();
        const xml = build();

        logger.log('debug', `${getRecordCount(filtered)}/${getRecordCount(obj)} records passed the filter`);

        if (getRecordCount(filtered) > 0) {
          await recordsCallback(xml);
          return resumptionToken ? harvest(resumptionToken) : undefined;
        }

        return resumptionToken ? harvest(resumptionToken) : undefined;

        function getRecordCount(obj) {
          return obj['OAI-PMH'].ListRecords[0].record.length;
        }

        function getResumptionToken() {
          const [container] = obj['OAI-PMH'].ListRecords;
          return container.resumptionToken ? container.resumptionToken._ : undefined;
        }

        function parse() {
          return new Promise((resolve, reject) => {
            new Parser().parseString(data, (err, obj) => {
              if (err) {
                return reject(err);
              }

              resolve(obj);
            });
          });
        }

        function filter() {
          const records = obj['OAI-PMH'].ListRecords[0].record.filter(filterRecords);

          return {
            ...obj,
            'OAI-PMH': {
              ListRecords: [{record: records}]
            }
          };

          function filterRecords({header, metadata}) {
            if (isDeleted()) {
              return false;
            }

            if (filterIsbnOnly && hasIsbn() === false) {
              return false;
            }

            if (filterIssuedYear && issuedBefore()) {
              return false;
            }

            return true;

            function isDeleted() {
              return '$' in header[0] && header[0].$.status === 'deleted';
            }

            function hasIsbn() {
              return getFields().some(({qualifier}) => qualifier === 'isbn');
            }

            function issuedBefore() {
              return getFields().some(({qualifier, value}) => qualifier === 'issued' && Number(value) < filterIssuedYear);
            }

            function getFields() {
              return Object.values(metadata[0]['kk:metadata'][0]['kk:field'])
                .filter(obj => '$' in obj)
                .map(({$}) => $);
            }
          }
        }

        function build() {
          try {
            return new Builder({
              xmldec: {
                version: '1.0',
                encoding: 'UTF-8',
                standalone: false
              },
              renderOpts: {
                pretty: true,
                indent: '\t'
              }
            }).buildObject(filtered);
          } catch (err) {
            throw new Error(`XML conversion failed ${err.message} for query: ${JSON.stringify(filtered)}`);
          }
        }
      }
    }
  }

  function getPollChangeTime() {
    if (fs.existsSync(changeTimestampFile)) {
      const {timestamp} = JSON.parse(fs.readFileSync(changeTimestampFile, 'utf8'));
      return moment(timestamp);
    }

    if (pollChangeTimestamp) {
      return moment(pollChangeTimestamp);
    }

    return moment();
  }
}
